import React, { useState } from 'react';
import { User, Settings as SettingsIcon, Volume2, Smartphone, Info, Zap } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { clsx } from 'clsx';

export const Settings: React.FC = () => {
  const { user, profile, updateProfile } = useFirebase();
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('arkumen_sound_enabled') !== 'false';
  });
  const [hapticEnabled, setHapticEnabled] = useState(() => {
    return localStorage.getItem('arkumen_haptic_enabled') !== 'false';
  });

  const toggleSound = (val: boolean) => {
    setSoundEnabled(val);
    localStorage.setItem('arkumen_sound_enabled', String(val));
  };

  const toggleHaptic = (val: boolean) => {
    setHapticEnabled(val);
    localStorage.setItem('arkumen_haptic_enabled', String(val));
  };

  return (
    <div className="min-h-screen bg-arkumen-bg pb-20">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/95 backdrop-blur-3xl px-6 py-5 flex items-center justify-between border-b border-white/5">
        <div className="flex flex-col">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] opacity-60">SYSTEM CONFIG</span>
          <h1 className="text-arkumen-gold font-display text-sm tracking-widest uppercase">Settings</h1>
        </div>
        <SettingsIcon size={18} className="text-arkumen-gold opacity-50" />
      </header>

      <main className="pt-28 px-6 max-w-md mx-auto space-y-10">
        {/* Account Archetype */}
        <section className="arena-card p-6 space-y-8">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
             <User className="text-arkumen-gold" size={18} />
             <h3 className="text-sm font-display text-white tracking-widest uppercase">Identity Link</h3>
          </div>
          
          <div className="space-y-8">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative group">
                <div className="w-28 h-28 rounded-3xl border-2 border-arkumen-gold/30 p-1 bg-slate-900 shadow-[0_0_40px_rgba(212,175,55,0.15)] group-hover:border-arkumen-gold/60 transition-all duration-500">
                  {profile?.photoURL ? (
                    <img src={profile.photoURL} alt="Avatar" className="w-full h-full rounded-2xl object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 rounded-2xl">
                       <User size={40} className="text-slate-600" />
                    </div>
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-arkumen-gold rounded-xl flex items-center justify-center cursor-pointer shadow-2xl hover:scale-110 active:scale-95 transition-all z-20 border-4 border-slate-950">
                  <Zap size={16} className="text-slate-950" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          await updateProfile({ photoURL: reader.result as string });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">REWRITE BIOMETRICS</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-1">
                  <span className="text-[7px] text-slate-500 font-black uppercase tracking-[0.2em]">IDENTIFIER</span>
                  <p className="text-md font-display text-white tracking-widest truncate">{profile?.username || 'GUEST'}</p>
               </div>
               <div className="space-y-1">
                  <span className="text-[7px] text-slate-500 font-black uppercase tracking-[0.2em]">ACCESS LEVEL</span>
                  <p className="text-md font-display text-arkumen-gold tracking-widest">{profile?.rank || 'NEOPHYTE'}</p>
               </div>
            </div>
          </div>
        </section>

        {/* Sensory Inputs */}
        <section className="arena-card p-6 space-y-8">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
             <Volume2 className="text-arkumen-gold" size={18} />
             <h3 className="text-sm font-display text-white tracking-widest uppercase">Atmosphere</h3>
          </div>

          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                 <span className="text-slate-300 text-sm font-bold tracking-wide uppercase">Auditory Pulse</span>
                 <span className="text-[8px] text-slate-500 font-medium uppercase tracking-widest">Interface sound effects</span>
              </div>
              <button 
                onClick={() => toggleSound(!soundEnabled)}
                className={clsx(
                  "w-16 h-8 rounded-full transition-all relative p-1",
                  soundEnabled ? "bg-arkumen-gold/20" : "bg-slate-800"
                )}
              >
                <div className={clsx(
                  "w-6 h-6 rounded-full transition-all flex items-center justify-center",
                  soundEnabled ? "translate-x-8 bg-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.5)]" : "translate-x-0 bg-slate-600"
                )}>
                  <Volume2 size={12} className={soundEnabled ? "text-slate-950" : "text-slate-400"} />
                </div>
              </button>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                 <span className="text-slate-300 text-sm font-bold tracking-wide uppercase">Kinetic Link</span>
                 <span className="text-[8px] text-slate-500 font-medium uppercase tracking-widest">Haptic response feedback</span>
              </div>
              <button 
                onClick={() => toggleHaptic(!hapticEnabled)}
                className={clsx(
                  "w-16 h-8 rounded-full transition-all relative p-1",
                  hapticEnabled ? "bg-arkumen-gold/20" : "bg-slate-800"
                )}
              >
                <div className={clsx(
                  "w-6 h-6 rounded-full transition-all flex items-center justify-center",
                  hapticEnabled ? "translate-x-8 bg-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.5)]" : "translate-x-0 bg-slate-600"
                )}>
                  <Smartphone size={12} className={hapticEnabled ? "text-slate-950" : "text-slate-400"} />
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* System Information */}
        <section className="text-center space-y-4 pt-4 opacity-40">
           <div className="flex items-center justify-center gap-4">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10"></div>
              <Info size={14} className="text-slate-500" />
              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10"></div>
           </div>
           <div className="space-y-1">
             <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.4em]">ARKUMEN CORE ENGINE v2.4.0</p>
             <p className="text-[8px] text-slate-600 font-medium uppercase tracking-[0.2em]">Synchronized with the Global Source • 2026</p>
           </div>
        </section>
      </main>
    </div>
  );
};
