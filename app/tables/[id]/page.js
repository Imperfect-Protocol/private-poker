import TableClient from '@/components/table/TableClient';

export default async function TablePage({ params, searchParams }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const lobbyId = resolvedSearchParams?.lobbyId || "1";

  return <TableClient tableId={id} lobbyId={lobbyId} />;
}
