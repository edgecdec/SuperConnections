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
  const [userId, setUserId] = useState<string | null>(null);
  
  // Use Refs for all callbacks to ensure socket listeners always use the latest logic
  // without triggering a socket reconnect cycle.
  const onStateUpdateRef = useRef(onStateUpdate);
  const getLatestStateRef = useRef(getLatestState);
  const onRemoteActionRef = useRef(onRemoteAction);
  const onActionResultRef = useRef(onActionResult);

  useEffect(() => { onStateUpdateRef.current = onStateUpdate; }, [onStateUpdate]);
  useEffect(() => { getLatestStateRef.current = getLatestState; }, [getLatestState]);
  useEffect(() => { onRemoteActionRef.current = onRemoteAction; }, [onRemoteAction]);
  useEffect(() => { onActionResultRef.current = onActionResult; }, [onActionResult]);

  const log = (msg: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [SOCKET] ${msg}`);
  };

  useEffect(() => {
    if (!roomCode) {
      setIsHost(false);
      setUserId(null);
      return;
    }

    log(`Connecting to room: ${roomCode}`);
    const socket = (io as any)();
    socketRef.current = socket;

    socket.on('connect', () => {
      log('Connected to socket server');
      const state = getLatestStateRef.current ? getLatestStateRef.current() : null;
      socket.emit('join_room', { 
        code: roomCode, 
        initialGameState: (state && state.tiles && state.tiles.length > 0) ? state : null 
      });
    });

    socket.on('init_session', (data: { isHost: boolean, userId: string }) => {
      log(`Session initialized. Host: ${data.isHost}, UserID: ${data.userId}`);
      setIsHost(data.isHost);
      setUserId(data.userId);
    });

    socket.on('state_update', (newState: GameState) => {
      log('Received full state update');
      if (onStateUpdateRef.current) onStateUpdateRef.current(newState);
    });

    socket.on('remote_action', (action: GameAction) => {
      log(`Received remote action: ${action.type}`);
      if (onRemoteActionRef.current) onRemoteActionRef.current(action);
    });

    socket.on('action_result', (response: ActionResponse) => {
      log(`Received action result: ${response.actionType} (${response.success ? 'Success' : 'Fail'})`);
      if (onActionResultRef.current) onActionResultRef.current(response);
    });

    socket.on('request_state', () => {
      log('Server requested latest state');
      const state = getLatestStateRef.current ? getLatestStateRef.current() : null;
      if (state && state.tiles && state.tiles.length > 0) {
        socket.emit('update_state', { code: roomCode, gameState: state, version: Date.now() });
      }
    });

    socket.on('disconnect', () => {
      log('Disconnected from socket server');
    });

    return () => {
      log('Cleaning up socket connection');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode]); // ONLY reconnect if the roomCode changes

  const dispatchAction = useCallback((action: GameAction) => {
    if (socketRef.current && roomCode) {
      log(`Dispatching action: ${action.type}`);
      socketRef.current.emit('game_action', { 
        code: roomCode, 
        action 
      });
    }
  }, [roomCode]);

  return { dispatchAction, isHost, userId };
}
