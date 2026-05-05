// app/tables/[id]/page.js
"use client";

import { use } from 'react';
import dynamic from 'next/dynamic';
import TableClient from '@/components/TableClient';

export default function TablePage({ params, searchParams }) {
  const resolvedParams = use(params);
  const resolvedSearchParams = use(searchParams);

  const tableId = resolvedParams.id;
  const lobbyId = resolvedSearchParams.lobbyId || "1";

  return <TableClient tableId={tableId} lobbyId={lobbyId} />;
}