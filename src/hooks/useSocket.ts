'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

export function useSocket(roomCode: string | null, onStateUpdate: (state: any) => void) {
  const socketRef = useRef<any>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!roomCode) return;

    const socket = (io as any)();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket');
      socket.emit('join_room', { code: roomCode });
    });

    socket.on('init_session', (data: { isHost: boolean, userId: string }) => {
      setIsHost(data.isHost);
    });

    socket.on('state_update', (newState: any) => {
      onStateUpdate(newState);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, onStateUpdate]);

  const updateServerState = useCallback((gameState: any) => {
    if (socketRef.current && roomCode) {
      // Ensure we don't send an empty state if we're in a room
      if (gameState.tiles && gameState.tiles.length > 0) {
        socketRef.current.emit('update_state', { code: roomCode, gameState });
      }
    }
  }, [roomCode]);

  return { updateServerState, isHost };
}
