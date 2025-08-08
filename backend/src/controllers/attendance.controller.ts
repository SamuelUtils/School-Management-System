// src/controllers/attendance.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { MarkAttendanceInput, UpdateAttendanceInput } from '@/models/attendance.types';
import { notificationService } from '@/lib/notification.service';

import { AttendanceStatus, Role } from '@prisma/client';
import { Prisma } from '@prisma/client'; // Import Prisma namespace for error types

const ATTENDANCE_CUTOFF_HOUR = 12; // 12 PM server time

// Helper to check if current time is before cutoff
const isBeforeAttendanceCutoff = (dateToCheck: Date, now: Date = new Date(Date.now())): boolean => {
    // Convert both dates to UTC midnight for comparison
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const targetDate = new Date(Date.UTC(dateToCheck.getUTCFullYear(), dateToCheck.getUTCMonth(), dateToCheck.getUTCDate()));

    if (targetDate.getTime() !== today.getTime()) {
        return false; // Can only mark attendance for today before cutoff
    }

    // Use UTC hour for cutoff check
    return now.getUTCHours() < ATTENDANCE_CUTOFF_HOUR;
};


// POST /teacher/attendance - Mark attendance for multiple students
export const markAttendanceByTeacher = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Received attendance request:', {
            body: req.body,
            user: req.user,
            date: new Date(Date.now()).toISOString()
        });

        const { date: dateString, entries } = req.body as MarkAttendanceInput;
        const markedById = req.user!.userId;

        console.log('Processing attendance with:', {
            dateString,
            entriesCount: entries?.length,
            markedById
        });

        if (!dateString || !entries || !Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ message: 'Date and a non-empty array of attendance entries are required.' });
        }

        const attendanceDate = new Date(dateString);
        if (isNaN(attendanceDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD.' });
        }
        // Normalize to midnight UTC for consistent date storage/querying if not already
        const normalizedDate = new Date(Date.UTC(attendanceDate.getUTCFullYear(), attendanceDate.getUTCMonth(), attendanceDate.getUTCDate()));


        // Time restriction: Only allow before 12 PM server time for today's date
        if (!isBeforeAttendanceCutoff(normalizedDate)) {
            return res.status(403).json({ message: `Attendance can only be marked for today before ${ATTENDANCE_CUTOFF_HOUR}:00 server time.` });
        }

        // Validate entries
        for (const entry of entries) {
            if (!entry.studentId || !entry.status || !Object.values(AttendanceStatus).includes(entry.status)) {
                return res.status(400).json({ message: 'Each entry must have a valid studentId and status (PRESENT or ABSENT).' });
            }
        }

        // Check if attendance for these students on this date already exists (to prevent duplicates by teacher)
        // Teachers should typically only mark once. Admins can override.
        const existingRecords = await prisma.attendance.findMany({
            where: {
                studentId: { in: entries.map(e => e.studentId) },
                date: normalizedDate,
            }
        });

        if (existingRecords.length > 0) {
            const alreadyMarkedStudentIds = existingRecords.map(r => r.studentId);
            return res.status(409).json({
                message: 'Attendance already marked for some students on this date. Admin can override.',
                alreadyMarkedStudentIds,
            });
        }


        const attendanceData = entries.map(entry => ({
            studentId: entry.studentId,
            date: normalizedDate,
            status: entry.status,
            markedById: markedById,
            // timestamp is defaulted by Prisma
        }));

        // Use transaction for atomicity if creating multiple records
        console.log('Attempting to create attendance records:', attendanceData);

        // Use transaction for atomicity if creating multiple records
        const result = await prisma.$transaction(
            attendanceData.map(data => prisma.attendance.create({ data }))
        );

        console.log('Successfully created attendance records:', result);

        // Simulate sending notifications for absent students
        // In a real app, this would be more robust, possibly an async job
        for (const entry of entries) {
            if (entry.status === AttendanceStatus.ABSENT) {
                const student = await prisma.student.findUnique({
                    where: { id: entry.studentId },
                    include: { parent: true }, // Assuming parent is linked and has phone
                });
                if (student && student.parent && student.parent.phone) {
                    await notificationService.sendNotification({
                        to: student.parent.phone,
                        message: `Dear Parent, your child ${student.name} was marked ABSENT on ${normalizedDate.toISOString().split('T')[0]}.`,
                    });
                }
            }
        }

        return res.status(201).json({ message: 'Attendance marked successfully', count: result.length });
    } catch (error) {
        console.error('Error in markAttendanceByTeacher:', {
            error
        });

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (
                error.code === 'P2003' &&
                typeof error.meta?.field_name === 'string' &&
                error.meta.field_name.includes('studentId')
            ) {
                return res.status(400).json({ message: 'One or more student IDs are invalid.' });
            }
        }

        return next(error);
    }
};


// PATCH /admin/attendance/:id - Admin override for a specific attendance record
export const updateAttendanceByAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: attendanceId } = req.params;
        const { status } = req.body as UpdateAttendanceInput;
        const markedById = req.user!.userId; // Admin's ID

        if (!status || !Object.values(AttendanceStatus).includes(status)) {
            return res.status(400).json({ message: 'Valid status (PRESENT or ABSENT) is required.' });
        }

        const existingAttendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
        if (!existingAttendance) {
            return res.status(404).json({ message: 'Attendance record not found.' });
        }

        const updatedAttendance = await prisma.attendance.update({
            where: { id: attendanceId },
            data: {
                status,
                markedById, // Update who last marked it
                timestamp: new Date(), // Update the timestamp of modification
            },
        });

        // Optionally, send a notification if status changed by admin, e.g., from ABSENT to PRESENT
        // (Logic would be similar to the teacher's notification part)

        return res.status(200).json(updatedAttendance);
    } catch (error) {
        next(error);
    }
};