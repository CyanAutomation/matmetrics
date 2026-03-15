"use client"

import { JudoSession } from "./types";

const STORAGE_KEY = "matmetrics_sessions";

// Pseudo test entries for initial testing and demonstration
const SEED_DATA: JudoSession[] = [
  {
    id: "seed-1",
    date: new Date(Date.now() - 86400000 * 1).toISOString().split('T')[0], // 1 day ago
    techniques: ["O-soto-gari", "Kuzure-kesa-gatame"],
    effort: 3, // Normal
    category: "Technical",
    notes: "Focused on the transition from a standing throw to groundwork. The grip break on the entry felt solid, but I need to improve my weight distribution once on the mat."
  },
  {
    id: "seed-2",
    date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0], // 3 days ago
    techniques: ["Uchi-mata", "O-uchi-gari"],
    effort: 4, // Hard
    category: "Randori",
    notes: "High intensity randori session today. Chained O-uchi-gari into Uchi-mata several times. Cardio felt a bit taxed towards the end, but the technical execution remained sharp."
  },
  {
    id: "seed-3",
    date: new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0], // 7 days ago
    techniques: ["Ippon-seoi-nage", "Tai-otoshi"],
    effort: 5, // Intense
    category: "Shiai",
    notes: "Internal club matches. Managed to secure a waza-ari with a well-timed Tai-otoshi. I was caught on a counter during a Seoi-nage attempt, so I need to work on my recovery after a failed entry."
  },
  {
    id: "seed-4",
    date: new Date(Date.now() - 86400000 * 10).toISOString().split('T')[0], // 10 days ago
    techniques: ["De-ashi-barai", "Okuri-ashi-barai"],
    effort: 2, // Light
    category: "Technical",
    notes: "Dedicated foot sweep practice. Timing is everything here. I found that my Okuri-ashi-barai is more effective when I focus on the opponent's lateral movement rather than just their feet."
  }
];

export function getSessions(): JudoSession[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (!stored) {
    // Seed the data if the storage is completely empty
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return SEED_DATA;
  }
  
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

// Function to reset all data back to seed data (can be used later)
export function resetToSeedData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
}

// Function to clear all data
export function clearAllData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
}
