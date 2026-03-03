'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

export function useSocket(roomCode: string | null, onStateUpdate: (state: any, version: number) => void) {
  const socketRef = useRef<any>(null);
  const [isHost, setIsHost] = useState(false);
  const versionRef = useRef(0);

  useEffect(() => {
    if (!roomCode) return;

    const socket = (io as any)();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket');
      socket.emit('join_room', { code: roomCode });
    });

    socket.on('init_session', (data: { isHost: boolean, userId: string, version: number }) => {
      setIsHost(data.isHost);
      versionRef.current = data.version || 0;
    });

    socket.on('state_update', (data: { gameState: any, version: number }) => {
      if (data.version > versionRef.current) {
        versionRef.current = data.version;
        onStateUpdate(data.gameState, data.version);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, onStateUpdate]);

  const updateServerState = useCallback((gameState: any) => {
    if (socketRef.current && roomCode) {
      if (gameState.tiles && gameState.tiles.length > 0) {
        const newVersion = Date.now();
        versionRef.current = newVersion;
        socketRef.current.emit('update_state', { code: roomCode, gameState, version: newVersion });
      }
    }
  }, [roomCode]);

  return { updateServerState, isHost };
}
