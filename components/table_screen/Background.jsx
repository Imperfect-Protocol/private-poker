export default function Background() {
  return (
    <div className="absolute inset-0 rounded-[100px] border-4 border-teal-500/10 shadow-[0_0_60px_rgba(20,184,166,0.15)] overflow-hidden">
      <img
        src="/table.jpg"
        alt="Poker Table"
        className="w-full h-full object-cover brightness-75 grayscale-[20%]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/90" />
    </div>
  );
}
