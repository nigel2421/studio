'use client';

import { FirestorePermissionError } from './errors';

type Listener = (error: FirestorePermissionError) => void;

class ErrorEmitter {
  private listeners: Listener[] = [];

  on(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(event: 'permission-error', error: FirestorePermissionError) {
    if (event === 'permission-error') {
      this.listeners.forEach(listener => listener(error));
    }
  }
}

export const errorEmitter = new ErrorEmitter();
