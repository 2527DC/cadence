// Rejections that nobody else is around to show.
//
// A write rejected by the database while the screen that made it is still open is
// that screen's to show — the close sheet prints the RPC's message under its Save
// button. A write rejected after it sat in the outbox — the sheet long closed, or the
// app relaunched — has no screen. It lands here, and the sync banner reads from here.
//
// A tiny external store rather than React Query state or context, because the writer
// (a mutation cache subscription in outbox-setup.ts) is not a component.

import { useSyncExternalStore } from 'react';

import { rememberProblem, type SyncProblem } from '@/lib/outbox';

let problems: SyncProblem[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): SyncProblem[] {
  return problems;
}

export function recordSyncProblem(message: string): void {
  problems = rememberProblem(problems, message, Date.now());
  listeners.forEach((l) => l());
}

export function dismissSyncProblems(): void {
  if (problems.length === 0) return;
  problems = [];
  listeners.forEach((l) => l());
}

export function useSyncProblems(): SyncProblem[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
