"use client"

import { JudoSession } from "./types";

const STORAGE_KEY = "matmetrics_sessions";

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

// Tag Management functions
export function getAllTags(): string[] {
  const sessions = getSessions();
  const tags = new Set<string>();
  sessions.forEach(s => s.techniques.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

export function renameTag(oldName: string, newName: string) {
  const sessions = getSessions();
  const updated = sessions.map(session => {
    if (session.techniques.includes(oldName)) {
      const newTechniques = session.techniques.map(t => t === oldName ? newName : t);
      // Remove duplicates if newName already existed
      return { ...session, techniques: Array.from(new Set(newTechniques)) };
    }
    return session;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteTag(tagName: string) {
  const sessions = getSessions();
  const updated = sessions.map(session => ({
    ...session,
    techniques: session.techniques.filter(t => t !== tagName)
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function mergeTags(sourceTag: string, targetTag: string) {
  renameTag(sourceTag, targetTag);
}
