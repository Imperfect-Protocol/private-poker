import { Web3Provider } from '@/components/Web3Provider';
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}