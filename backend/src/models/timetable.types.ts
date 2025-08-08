// src/models/timetable.types.ts
import { DayOfWeek } from '@prisma/client';

export interface TimetableSlotPayload {
  id?: string; // Optional: for updates, if you decide to use POST for updates too
  dayOfWeek: DayOfWeek;
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  currentClass: string;
  section?: string | null; // Allow null explicitly for Prisma optional fields
  subject: string;
  teacherId?: string | null; // Allow null for unassigned or to clear assignment
  date?: string | null; // YYYY-MM-DD format, for alternate/specific date slots
}
// Payload for the new endpoint POST /admin/alternate-timetable
export interface AlternateTimetablePayload {
    date: string; // YYYY-MM-DD, the specific date for these alternate slots
    slots: Omit<TimetableSlotPayload, 'dayOfWeek' | 'date'>[]; // dayOfWeek will be derived from date
                                                               // date will be the one provided at top level
}

export interface AssignSubstitutePayload {
  timetableSlotId: string;
  substituteTeacherId: string; // User ID of the teacher who will substitute
  // The date for substitution is implicitly the date of the TimetableSlot if it's a date-specific slot,
  // or "today" / a specified date if it's a regular weekly slot being substituted for a single occurrence.
  // For simplicity, let's assume this endpoint assigns a substitute to an *existing* slot,
  // and if that slot is date-specific, the substitution applies to that date.
  // If it's a regular weekly slot, this substitution would ideally apply for a *specific date occurrence*
  // which means the `TimetableSlot` being updated should ideally be a date-specific instance.
  // For now, we'll update the substituteTeacherId on the given slotId.
  // A more advanced system might create a temporary overriding slot for the substitution.
}