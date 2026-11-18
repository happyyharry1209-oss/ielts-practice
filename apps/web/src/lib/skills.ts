import { BookOpen, Headphones, Mic, PenLine } from 'lucide-react';

export const SKILLS = [
  { key: 'reading', Icon: BookOpen, accent: 'bg-emerald-100 text-emerald-700' },
  { key: 'listening', Icon: Headphones, accent: 'bg-sky-100 text-sky-700' },
  { key: 'writing', Icon: PenLine, accent: 'bg-amber-100 text-amber-800' },
  { key: 'speaking', Icon: Mic, accent: 'bg-rose-100 text-rose-700' },
] as const;

export function skillLabel(skill: string): string {
  return `home.skill${skill.charAt(0).toUpperCase()}${skill.slice(1)}`;
}
