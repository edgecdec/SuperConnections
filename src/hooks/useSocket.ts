'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { GameState, GameAction, ActionResponse } from '../types';

export function useSocket(
  roomCode: string | null, 
  onStateUpdate: (state: GameState) => void,
  getLatestState?: () => GameState | null,
  onRemoteAction?: (action: GameAction) => void,
  onActionResult?: (response: ActionResponse) => void
) {
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
      console.log('Session initialized. Host:', data.isHost);
      setIsHost(data.isHost);
    });

    socket.on('state_update', (newState: GameState) => {
      onStateUpdate(newState);
    });

    socket.on('remote_action', (action: GameAction) => {
      if (onRemoteAction) onRemoteAction(action);
    });

    socket.on('action_result', (response: ActionResponse) => {
      if (onActionResult) onActionResult(response);
    });

    socket.on('request_state', () => {
      const state = getLatestStateRef.current ? getLatestStateRef.current() : null;
      if (state && state.tiles && state.tiles.length > 0) {
        socket.emit('update_state', { code: roomCode, gameState: state, version: Date.now() });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, onStateUpdate, onRemoteAction, onActionResult]);

  const dispatchAction = useCallback((action: GameAction) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit('game_action', { 
        code: roomCode, 
        action 
      });
    }
  }, [roomCode]);

  return { dispatchAction, isHost };
}
