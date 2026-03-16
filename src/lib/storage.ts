"use client"

import { JudoSession } from "./types";

const STORAGE_KEY = "matmetrics_sessions";
const PROMPT_KEY = "matmetrics_transformer_prompt";

const DEFAULT_TRANSFORMER_PROMPT = `You are an experienced Judo practitioner helping a student write their training diary.

Your task is to take the following raw, informal notes from a Judo practice session and transform them into a well-structured, clear, and terminologically accurate diary entry.

Guidelines:
- **Tone**: Use an informal, personal, and reflective tone. It should feel like a student writing in their own training diary. Avoid being overly optimistic, buoyant, or exaggerated; maintain a neutral and realistic perspective on the session.
- **Terminology**: Use official Kodokan Judo terminology. Crucially, all techniques MUST be correctly hyphenated (e.g., "O-soto-gari", "Ippon-seoi-nage", "Uchi-mata", "Kuzushi"). Ensure correct spelling and capitalization according to Kodokan standards.
- **Content**: Maintain all specific details and meaning provided by the user.
- **Structure**: Organize the notes so they flow logically. If the input is just a list, turn it into a few readable, reflective sentences.
- **Focus**: Emphasize the specific techniques practiced and the trainee's honest reflections on what went well or what needs work.`;

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
  }
];

export function getSessions(): JudoSession[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (!stored) {
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
  writeSessions(sessions => [session, ...sessions]);
}

export function updateSession(session: JudoSession) {
  writeSessions(sessions => sessions.map(s => s.id === session.id ? session : s));
}

export function deleteSession(id: string) {
  writeSessions(sessions => sessions.filter(s => s.id !== id));
}

export function getAllTags(): string[] {
  const sessions = getSessions();
  const tags = new Set<string>();
  sessions.forEach(s => s.techniques.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

export function renameTag(oldName: string, newName: string) {
  writeSessions(sessions => sessions.map(session => {
    if (session.techniques.includes(oldName)) {
      const newTechniques = session.techniques.map(t => t === oldName ? newName : t);
      return { ...session, techniques: Array.from(new Set(newTechniques)) };
    }
    return session;
  }));
}

export function deleteTag(tagName: string) {
  writeSessions(sessions => sessions.map(session => ({
    ...session,
    techniques: session.techniques.filter(t => t !== tagName)
  })));
}

export function mergeTags(sourceTag: string, targetTag: string) {
  renameTag(sourceTag, targetTag);
}

// AI Transformer Prompt Persistence
export function getTransformerPrompt(): string {
  if (typeof window === "undefined") return DEFAULT_TRANSFORMER_PROMPT;
  return localStorage.getItem(PROMPT_KEY) || DEFAULT_TRANSFORMER_PROMPT;
}

export function saveTransformerPrompt(prompt: string) {
  localStorage.setItem(PROMPT_KEY, prompt);
}

export function resetTransformerPrompt() {
  localStorage.setItem(PROMPT_KEY, DEFAULT_TRANSFORMER_PROMPT);
}

export function clearAllData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
}

type SessionsTransformer = (sessions: JudoSession[]) => JudoSession[];

function writeSessions(transformer: SessionsTransformer) {
  if (typeof window === "undefined") return;

  const stored = localStorage.getItem(STORAGE_KEY);
  let sessions: JudoSession[];

  if (!stored) {
    sessions = SEED_DATA;
  } else {
    try {
      sessions = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse sessions", e);
      sessions = [];
    }
  }

  const updated = transformer(sessions);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
