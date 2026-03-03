// app/tables/create/page.js
"use client";

import { useState } from 'react';

export default function CreateTablePage() {
  const [formData, setFormData] = useState({
    name: "My Private Node",
    game: "Texas Hold'em",
    buyin: 1000,
    blinds: "10/20",
    maxPlayers: 6
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Deploying Table:", formData);
    // Here you would normally POST to your API, then redirect to the new table ID
    alert("Protocol deployed! Check console for data.");
  };

  const handleCancel = () => {
    // Since this opened in a new tab, canceling should just close the tab
    window.close();
  };

  return (
    <main className="min-h-screen bg-slate-950 relative flex items-center justify-center p-4">
      {/* Background styling to make it look like an overlay over the lobby */}
      <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-900 via-slate-950 to-slate-950" />
      
      {/* The Modal Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-teal-500/30 rounded-2xl shadow-[0_0_50px_rgba(20,184,166,0.15)] overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
          <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
            Initialization Sequence
          </p>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
            Deploy New Protocol
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          
          <div>
            <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Protocol Name</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full bg-slate-950 border border-slate-700 text-teal-400 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 focus:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Game Type</label>
              <select 
                value={formData.game}
                onChange={(e) => setFormData({...formData, game: e.target.value})}
                className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 transition-all appearance-none cursor-pointer"
              >
                <option>Texas Hold'em</option>
                <option>Omaha</option>
                <option>Draw Poker</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Capacity</label>
              <select 
                value={formData.maxPlayers}
                onChange={(e) => setFormData({...formData, maxPlayers: Number(e.target.value)})}
                className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 transition-all appearance-none cursor-pointer font-mono"
              >
                <option value={2}>2 Players (Heads Up)</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players</option>
                <option value={6}>6 Players (Max)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Buy-In ($)</label>
              <input 
                type="number" 
                value={formData.buyin}
                onChange={(e) => setFormData({...formData, buyin: Number(e.target.value)})}
                className="w-full bg-slate-950 border border-slate-700 text-teal-400 font-mono text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 focus:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Blinds</label>
              <input 
                type="text" 
                value={formData.blinds}
                onChange={(e) => setFormData({...formData, blinds: e.target.value})}
                placeholder="e.g. 10/20"
                className="w-full bg-slate-950 border border-slate-700 text-teal-400 font-mono text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 focus:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-all"
                required
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6 pt-6 border-t border-slate-800">
            <button 
              type="button"
              onClick={handleCancel}
              className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 hover:text-slate-200 transition-colors uppercase text-xs tracking-widest cursor-pointer"
            >
              Abort
            </button>
            <button 
              type="submit"
              className="flex-[2] py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] cursor-pointer"
            >
              Initialize Node
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}