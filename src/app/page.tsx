'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Container } from '@mui/material';

import { useGameLogic } from '../hooks/useGameLogic';
import { SetupScreen } from '../components/SetupScreen';

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCodeFromUrl = searchParams.get('room');

  // We pass true for ignoreLocalSave because this is the home/setup page
  // We do not want to auto-load local storage here.
  const { game, isPlaying } = useGameLogic(null, true);

  useEffect(() => {
    if (roomCodeFromUrl) {
      router.push(`/play?room=${roomCodeFromUrl}`);
    }
  }, [roomCodeFromUrl, router]);

  return (
    <Container maxWidth={false} disableGutters>
      <SetupScreen onStart={game.start} />
    </Container>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
