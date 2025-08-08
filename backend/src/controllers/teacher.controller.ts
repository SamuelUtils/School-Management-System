// src/controllers/teacher.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { Role, DayOfWeek, TimetableSlot } from '@prisma/client';
import { timeToMinutes } from '@/lib/time.utils';
import { getDayOfWeekFromDate } from '@/lib/time.utils';

// Define type for TimetableSlot with included relations
type TimetableSlotWithRelations = TimetableSlot & {
    teacher: { name: string; id: string } | null;
    substituteTeacher: { name: string; id: string } | null;
};

export const getTeacherTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const teacherId = req.user!.userId;
        const queryDateString = req.query.date as string | undefined;

        let effectiveSlotsForTeacher: TimetableSlotWithRelations[] = [];

        if (queryDateString) {
            const parsedDate = new Date(queryDateString);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ message: "Invalid query date format. Use YYYY-MM-DD." });
            }
            const targetDate = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()));
            const targetDayOfWeek = getDayOfWeekFromDate(targetDate);

            // 1. First check if they are substituting any slots on this specific date
            const substitutingDateSlots = await prisma.timetableSlot.findMany({
                where: {
                    substituteTeacherId: teacherId,
                    date: targetDate
                },
                include: {
                    teacher: { select: { name: true, id: true } },
                    substituteTeacher: { select: { name: true, id: true } }
                }
            });

            // 2. Check their own slots for this date (where they haven't been substituted)
            const ownDateSpecificSlots = await prisma.timetableSlot.findMany({
                where: {
                    teacherId: teacherId,
                    date: targetDate,
                    substituteTeacherId: null // Only get slots where they haven't been substituted
                },
                include: {
                    teacher: { select: { name: true, id: true } },
                    substituteTeacher: { select: { name: true, id: true } }
                }
            });

            // 3. Check if there are any date-specific slots where they have been substituted
            const substitutedDateSlots = await prisma.timetableSlot.findMany({
                where: {
                    teacherId: teacherId,
                    date: targetDate,
                    NOT: { substituteTeacherId: null }
                }
            });

            if (substitutingDateSlots.length > 0 || ownDateSpecificSlots.length > 0 || substitutedDateSlots.length > 0) {
                // If there are any date-specific slots (either as substitute, own, or substituted),
                // only return the ones where they are actively teaching (as substitute or original unsubstituted teacher)
                effectiveSlotsForTeacher = [...substitutingDateSlots, ...ownDateSpecificSlots];
            } else {
                // 4. If no date-specific slots exist at all, get regular weekly slots for this day
                const regularWeeklySlotsForDay = await prisma.timetableSlot.findMany({
                    where: {
                        teacherId: teacherId,
                        dayOfWeek: targetDayOfWeek,
                        date: null,
                        substituteTeacherId: null // Only get slots where they haven't been substituted
                    },
                    include: {
                        teacher: { select: { name: true, id: true } },
                        substituteTeacher: { select: { name: true, id: true } }
                    }
                });

                // Also get any regular weekly slots where they are the substitute
                const regularSubstitutingSlots = await prisma.timetableSlot.findMany({
                    where: {
                        substituteTeacherId: teacherId,
                        dayOfWeek: targetDayOfWeek,
                        date: null
                    },
                    include: {
                        teacher: { select: { name: true, id: true } },
                        substituteTeacher: { select: { name: true, id: true } }
                    }
                });

                effectiveSlotsForTeacher = [...regularWeeklySlotsForDay, ...regularSubstitutingSlots];
            }
        } else {
            // No date query - get all regular slots where they are the teacher (and not substituted)
            // plus any slots where they are the substitute
            const regularSlots = await prisma.timetableSlot.findMany({
                where: {
                    teacherId: teacherId,
                    date: null,
                    substituteTeacherId: null // Only get slots where they haven't been substituted
                },
                include: {
                    teacher: { select: { name: true, id: true } },
                    substituteTeacher: { select: { name: true, id: true } }
                }
            });

            const substitutingSlots = await prisma.timetableSlot.findMany({
                where: {
                    substituteTeacherId: teacherId,
                    date: null // Only get regular substitution assignments
                },
                include: {
                    teacher: { select: { name: true, id: true } },
                    substituteTeacher: { select: { name: true, id: true } }
                }
            });

            effectiveSlotsForTeacher = [...regularSlots, ...substitutingSlots];
        }

        // Add a flag to indicate if the current teacher is teaching as a substitute
        const finalSlots = effectiveSlotsForTeacher.map(slot => ({
            ...slot,
            isSubstituteAssignment: slot.substituteTeacherId === teacherId,
            originalTeacherName: slot.teacher?.name,
            teachingTeacherName: slot.substituteTeacherId ? slot.substituteTeacher?.name : slot.teacher?.name,
            date: slot.date ? slot.date.toISOString().split('T')[0] : null
        }));

        const dayOrder: Record<DayOfWeek, number> = {
            MONDAY: 1,
            TUESDAY: 2,
            WEDNESDAY: 3,
            THURSDAY: 4,
            FRIDAY: 5,
            SATURDAY: 6,
            SUNDAY: 7
        };

        // Sort by day and then by time
        return res.status(200).json(
            finalSlots.sort((a, b) => {
                if (a.dayOfWeek && b.dayOfWeek) {
                    const dayDiff = dayOrder[a.dayOfWeek] - dayOrder[b.dayOfWeek];
                    if (dayDiff !== 0) return dayDiff;
                }
                return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
            })
        );
    } catch (error) {
        next(error);
    }
};