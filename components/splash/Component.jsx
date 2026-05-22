"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Splash() {
  const [fadeSplash, setFadeSplash] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeSplash(true), 2000);
    const redirectTimer = setTimeout(() => router.push('/signin'), 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ease-in-out ${fadeSplash ? 'opacity-0' : 'opacity-100'}`}>
      <div className="absolute inset-0 z-0">
        <img src="/splash.jpg" alt="Splash Background" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/30" />
      </div>
      <div className="relative z-10 text-center flex flex-col items-center">
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tighter uppercase mb-4 drop-shadow-[0_0_25px_rgba(20,184,166,0.6)]">
          Private Poker
        </h1>
        <div className="border-t border-teal-500/50 pt-3 px-8">
          <p className="text-teal-600 font-mono text-xs md:text-sm tracking-[0.5em] uppercase font-bold">Imperfect Protocol</p>
        </div>
      </div>
    </div>
  );
}
