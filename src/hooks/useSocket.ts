'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

export function useSocket(roomCode: string | null, onStateUpdate: (state: any, version: number) => void, getLatestState?: () => any) {
  const socketRef = useRef<any>(null);
  const [isHost, setIsHost] = useState(false);
  const versionRef = useRef(0);
  const getLatestStateRef = useRef(getLatestState);

  // Update the ref so the socket always has access to the most recent state getter
  useEffect(() => {
    getLatestStateRef.current = getLatestState;
  }, [getLatestState]);

  useEffect(() => {
    if (!roomCode) {
      setIsHost(false);
      versionRef.current = 0;
      return;
    }

    const socket = (io as any)();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket');
      const state = getLatestStateRef.current ? getLatestStateRef.current() : null;
      socket.emit('join_room', { 
        code: roomCode, 
        gameState: (state && state.tiles && state.tiles.length > 0) ? state : null 
      });
    });

    socket.on('init_session', (data: { isHost: boolean, userId: string, version: number }) => {
      setIsHost(data.isHost);
      versionRef.current = data.version || 0;
    });

    socket.on('request_state', () => {
      console.log('Server requested latest state');
      const state = getLatestStateRef.current ? getLatestStateRef.current() : null;
      if (state && state.tiles && state.tiles.length > 0) {
        const newVersion = Date.now();
        versionRef.current = newVersion;
        socket.emit('update_state', { code: roomCode, gameState: state, version: newVersion });
      }
    });

    socket.on('state_update', (data: { gameState: any, version: number }) => {
      if (data && data.version > versionRef.current) {
        versionRef.current = data.version;
        onStateUpdate(data.gameState, data.version);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, onStateUpdate]);

  const updateServerState = useCallback((gameState: any) => {
    if (socketRef.current && roomCode) {
      if (gameState.tiles && gameState.tiles.length > 0) {
        const newVersion = Date.now();
        // Only update locally if the version we are sending is actually newer
        if (newVersion > versionRef.current) {
          versionRef.current = newVersion;
          socketRef.current.emit('update_state', { code: roomCode, gameState, version: newVersion });
        }
      }
    }
  }, [roomCode]);

  return { updateServerState, isHost };
}
