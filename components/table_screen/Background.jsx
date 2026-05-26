export default function Background() {
  return (
    <div className="absolute inset-0 rounded-[100px] border-4 border-sky-100/28 shadow-[0_0_29px_rgba(186,230,253,0.3),0_0_68px_rgba(56,189,248,0.18),inset_0_0_24px_rgba(224,242,254,0.14)] overflow-hidden">
      <img
        src="/table.jpg"
        alt="Poker Table"
        className="w-full h-full object-cover brightness-75 grayscale-[20%]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/90" />
    </div>
  );
}
