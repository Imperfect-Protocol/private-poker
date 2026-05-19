export default function DimmOverlay({ active }) {
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/20 backdrop-blur-sm" />
  );
}
