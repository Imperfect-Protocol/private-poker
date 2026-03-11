// app/table/[id]/page.js (or whatever your exact path is)
import TableClient from '@/components/TableClient';

export default async function TablePage({ params, searchParams }) {
  // In Next.js 15, params and searchParams must be awaited
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const tableId = resolvedParams.id;
  
  // We need the lobbyId to query the contract. Default to "1" as a fallback.
  const lobbyId = resolvedSearchParams.lobbyId || "1"; 

  return <TableClient tableId={tableId} lobbyId={lobbyId} />;
}