// app/lobby/[id]/page.js
"use client";

import { use } from 'react';
import dynamic from 'next/dynamic';
import LobbyClient from '@/components/LobbyClient';

export default function LobbyPage({ params }) {
  // Unwrap the dynamic route parameter safely
  const { id } = use(params);

  return <LobbyClient id={id} />;
}