export default function TableDialogOverlay({ isClosing = false, children }) {
  return (
    <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}>
      <div className={`relative z-10 w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-teal-500/30 rounded-2xl shadow-[0_0_50px_rgba(20,184,166,0.15)] overflow-hidden transition-transform duration-200 ${isClosing ? 'scale-95' : 'scale-100'}`}>
        {children}
      </div>
    </div>
  );
}
