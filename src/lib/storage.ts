"use client"

import { JudoSession } from "./types";

const STORAGE_KEY = "judoflow_sessions";

export function getSessions(): JudoSession[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse sessions", e);
    return [];
  }
}

export function saveSession(session: JudoSession) {
  const sessions = getSessions();
  const updated = [session, ...sessions];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function updateSession(session: JudoSession) {
  const sessions = getSessions();
  const updated = sessions.map(s => s.id === session.id ? session : s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteSession(id: string) {
  const sessions = getSessions();
  const updated = sessions.filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
