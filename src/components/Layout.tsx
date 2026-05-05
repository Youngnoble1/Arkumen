import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, BarChart2, User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { useFirebase } from './FirebaseProvider';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { profile } = useFirebase();

  const navItems = [
    { path: '/arena', icon: Home, label: 'THE ARK' },
    { path: '/leaderboard', icon: BarChart2, label: 'RANKS' },
    { path: '/profile', icon: User, label: 'PROFILE' },
    { path: '/settings', icon: Settings, label: 'SETTINGS' },
  ];

  const isReception = location.pathname === '/';
  const isQuiz = location.pathname === '/quiz';
  const isBattle = location.pathname === '/battle';
  const isSpecialMode = isReception || isQuiz || isBattle;

  return (
    <div className="min-h-screen bg-arkumen-bg text-slate-100 font-sans selection:bg-arkumen-gold/30 overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-arkumen-gold/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/5 blur-[100px] rounded-full"></div>
      </div>

      {/* Main Content Area */}
      <main className={clsx(
        "pb-24 px-4 w-full relative z-10",
        !isSpecialMode ? "pt-8" : "pt-0"
      )}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </main>

      {/* Cinematic Bottom Navigation - Hidden in Reception or Games */}
      {!isSpecialMode && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <div className="bg-[#020617]/90 backdrop-blur-3xl border border-white/5 rounded-2xl flex justify-between items-center px-2 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                
                return (
                  <Link 
                    key={item.path} 
                    to={item.path}
                    className={clsx(
                      "flex-1 flex flex-col items-center gap-1.5 transition-all duration-500 relative py-2",
                      isActive ? "text-arkumen-gold" : "text-slate-600 hover:text-slate-400"
                    )}
                  >
                    <div className="relative">
                      {isActive && (
                        <motion.div 
                          layoutId="nav-glow"
                          className="absolute inset-[-8px] bg-arkumen-gold/20 blur-xl rounded-full z-0"
                        />
                      )}
                      <Icon 
                        size={20} 
                        className={clsx(
                          "relative z-10 transition-transform duration-500",
                          isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]" : "scale-100"
                        )} 
                      />
                    </div>
                    <span className={clsx(
                      "text-[8px] font-black uppercase tracking-[0.2em] transition-all",
                      isActive ? "opacity-100 translate-y-0" : "opacity-40 translate-y-1"
                    )}>
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div 
                        layoutId="active-dot"
                        className="absolute -bottom-1 w-1 h-1 bg-arkumen-gold rounded-full shadow-[0_0_10px_rgba(212,175,55,0.8)]"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
};
