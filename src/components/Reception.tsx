import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';

export const Reception: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-arkumen-bg flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-12"
      >
        <div className="space-y-4">
          <motion.div 
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="w-24 h-24 bg-arkumen-gold/10 rounded-3xl border border-arkumen-gold/20 flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(212,175,55,0.1)]"
          >
            <Zap size={48} className="text-arkumen-gold" />
          </motion.div>
          
          <h1 className="heading-arkumen text-4xl md:text-5xl leading-tight">
            THE ARKUMEN
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em]">
            Digital Sanctuary of Wisdom
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="space-y-6"
        >
          <div className="p-8 rounded-[2rem] bg-slate-900/50 border border-white/5 backdrop-blur-xl space-y-4">
            <p className="font-luxury text-xl text-arkumen-gold/90 leading-relaxed italic">
              "Beloved Arker, welcome to the Arkumen quiz game."
            </p>
            <div className="h-[1px] w-12 bg-arkumen-gold/20 mx-auto"></div>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-loose">
              Prepare your spirit for the trials of revelation. Your journey through the mysteries begins here.
            </p>
          </div>

          <button
            onClick={() => navigate('/arena')}
            className="w-full group relative py-5 bg-arkumen-gold text-slate-950 rounded-2xl font-display text-xs tracking-[0.3em] uppercase overflow-hidden shadow-[0_0_40px_rgba(212,175,55,0.2)] transition-all active:scale-95"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <span className="relative flex items-center justify-center gap-2">
              Enter Arena <ChevronRight size={16} />
            </span>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};
