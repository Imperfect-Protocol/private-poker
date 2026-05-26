import TableDialogOverlay from '@/components/dialog/TableDialogOverlay';

export default function MediaDataChannelDialog({ onClose }) {
  return (
    <TableDialogOverlay>
      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20 text-center">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className="text-2xl font-black tracking-widest uppercase italic text-yellow-200">
          Media Not Connected
        </h1>
      </div>

      <div className="p-6 flex flex-col gap-5">
        <p className="text-center text-sm leading-6 text-slate-300">
          Camera and microphone handshakes require an open RTC data channel.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] cursor-pointer"
        >
          OK
        </button>
      </div>
    </TableDialogOverlay>
  );
}
