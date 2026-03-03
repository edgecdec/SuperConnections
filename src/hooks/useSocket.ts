'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

export function useSocket(roomCode: string | null, onStateUpdate: (state: any) => void, getLatestState?: () => any) {
  const socketRef = useRef<any>(null);
  const [isHost, setIsHost] = useState(false);
  const getLatestStateRef = useRef(getLatestState);

  useEffect(() => {
    getLatestStateRef.current = getLatestState;
  }, [getLatestState]);

  useEffect(() => {
    if (!roomCode) {
      setIsHost(false);
      return;
    }

    const socket = (io as any)();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket');
      const state = getLatestStateRef.current ? getLatestStateRef.current() : null;
      socket.emit('join_room', { 
        code: roomCode, 
        initialGameState: (state && state.tiles && state.tiles.length > 0) ? state : null 
      });
    });

    socket.on('init_session', (data: { isHost: boolean, userId: string }) => {
      setIsHost(data.isHost);
    });

    socket.on('state_update', (newState: any) => {
      onStateUpdate(newState);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, onStateUpdate]);

  const sendAction = useCallback((type: string, payload: any = {}) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit('game_action', { 
        code: roomCode, 
        action: { type, payload } 
      });
    }
  }, [roomCode]);

  return { sendAction, isHost };
}
