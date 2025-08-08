// src/models/attendance.types.ts
import { AttendanceStatus } from '@prisma/client';

export interface AttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
}

export interface MarkAttendanceInput {
  date: string; // YYYY-MM-DD
  entries: AttendanceEntry[];
}

export interface UpdateAttendanceInput {
  status: AttendanceStatus;
}