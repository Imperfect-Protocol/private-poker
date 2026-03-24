// app/tables/[id]/layout.js

// This tells Cloudflare to use the Edge runtime for this entire route segment
export const runtime = 'edge';

export default function TableLayout({ children }) {
  return children;
}