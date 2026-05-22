import Navbar from '@/components/layout/Navbar';

export default function SiteLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 [--navbar-height:4rem]">
      <Navbar />
      <main className="min-h-0 h-[calc(100vh-var(--navbar-height))] overflow-auto">
        {children}
      </main>
    </div>
  );
}
