// src/controllers/query.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { ParentQueryCreatePayload, QueryUpdatePayload } from '@/models/query.types';
import { Role, QueryStatus, User, Prisma } from '@prisma/client';
import { notificationService } from '@/lib/notification.service';
import { JwtPayload } from 'jsonwebtoken';

// Helper to find a class teacher (simplified)
// In a real system, this would be more robust, e.g., a designated "class teacher" role per class/section
const findClassTeacherForStudent = async (studentId: string): Promise<string | null> => {
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { currentClass: true, section: true }
    });

    if (!student) return null;

    // Find any teacher who teaches this class and section from the timetable
    const timetableSlot = await prisma.timetableSlot.findFirst({
        where: {
            currentClass: student.currentClass,
            section: student.section,
            teacherId: { not: null }, // Ensure there is a teacher assigned
            date: null, // Prioritize regular weekly timetable for class teacher
        },
        select: { teacherId: true }
    });

    return timetableSlot?.teacherId || null;
};

// POST /api/queries - Parent raises a query
export const createParentQuery = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parentId = req.user!.userId;
        const { studentId, subject, message } = req.body as ParentQueryCreatePayload;

        if (!studentId || !subject || !message) {
            return res.status(400).json({ message: 'Student ID, subject, and message are required.' });
        }

        // 1. Verify student exists
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, name: true, parentId: true }
        });

        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // 2. Verify student is mapped to this parent
        if (student.parentId !== parentId) {
            return res.status(403).json({ message: 'Forbidden: You can only raise queries for your own child.' });
        }

        // 3. Try to find a class teacher for auto-assignment
        const assignedToId = await findClassTeacherForStudent(studentId);

        // 4. Create the Query
        const newQuery = await prisma.query.create({
            data: {
                parentId,
                studentId,
                assignedToId, // Can be null
                subject,
                message,
                status: QueryStatus.OPEN, // Default status
            },
            include: { // Include details for response
                parent: { select: { id: true, name: true } },
                student: { select: { id: true, name: true } },
                assignedTo: assignedToId ? { select: { id: true, name: true, role: true } } : undefined,
            }
        });

        // 5. Send notification if query was assigned
        if (assignedToId) {
            await notificationService.createAndSendNotification({
                userIdToNotify: assignedToId,
                type: 'QUERY_ASSIGNED',
                relatedId: newQuery.id,
                context: {
                    queryId: newQuery.id,
                    querySubject: subject,
                    studentName: student.name,
                    parentName: newQuery.parent.name
                }
            });
        }

        return res.status(201).json(newQuery);
    } catch (error) {
        next(error);
    }
};

// GET /api/queries - List queries for the current user
// export const listUserQueries = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const userId = req.user!.userId;
//         const role = req.user!.role;

//         const queries = await prisma.query.findMany({
//             where: role === Role.PARENT
//                 ? { parentId: userId }
//                 : { assignedToId: userId },
//             include: {
//                 parent: { select: { id: true, name: true } },
//                 student: { select: { id: true, name: true } },
//                 assignedTo: { select: { id: true, name: true, role: true } }
//             },
//             orderBy: { createdAt: 'desc' }
//         });

//         return res.status(200).json(queries);
//     } catch (error) {
//         next(error);
//     }
// };

// Type guard for User
function isUser(user: JwtPayload | undefined): user is User {
    return user !== undefined &&
        'id' in user &&
        'role' in user;
}

export const listUserQueries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!isUser(req.user)) {
            return res.status(401).json({ message: "Invalid user authentication" });
        }
        const user = req.user;
        const { assignedTo, status, studentId, parentId } = req.query;
        const isAssignedRoute = req.path === '/assigned';

        const whereClause: Prisma.QueryWhereInput = {};

        if (user.role === Role.PARENT) {
            // Parents can only see their own queries
            whereClause.parentId = user.id;
        } else if (user.role === Role.TEACHER) {
            // For /assigned route, show all queries assigned to this teacher
            // For regular route, show all queries where this teacher is involved (as assignee)
            if (isAssignedRoute) {
                whereClause.assignedToId = user.id;
            } else {
                whereClause.assignedToId = user.id;
            }
        } else if (user.role === Role.ADMIN) {
            // Admins can see more, potentially filter
            if (assignedTo === 'me') {
                whereClause.assignedToId = user.id;
            } else if (assignedTo === 'unassigned') {
                whereClause.assignedToId = null;
            } else if (typeof assignedTo === 'string' && assignedTo.length > 0 && assignedTo !== 'all') {
                whereClause.assignedToId = assignedTo; // Filter by specific assignee ID
            }
            // If 'assignedTo' is 'all' or not provided, admin sees all assigned/unassigned unless other filters apply
        }

        if (status && Object.values(QueryStatus).includes(status as QueryStatus)) {
            whereClause.status = status as QueryStatus;
        }
        if (typeof studentId === 'string' && studentId.length > 0) {
            whereClause.studentId = studentId;
        }
        if (typeof parentId === 'string' && parentId.length > 0 && user.role === Role.ADMIN) {
            // Only admins can filter by parentId
            whereClause.parentId = parentId;
        }

        const queries = await prisma.query.findMany({
            where: whereClause,
            include: {
                parent: { select: { id: true, name: true, phone: true } },
                student: { select: { id: true, name: true, currentClass: true, section: true } },
                assignedTo: { select: { id: true, name: true, role: true } },
            },
            orderBy: {
                createdAt: 'desc', // Show newest first
            },
        });

        return res.status(200).json(queries);
    } catch (error) {
        next(error);
    }
};

// PATCH /queries/:id - Update status or resolutionComment (Teacher/Admin)
// Admin can also reassign (optional feature added)
export const updateQuery = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!isUser(req.user)) {
            return res.status(401).json({ message: "Invalid user authentication" });
        }
        const user = req.user;
        const { id: queryId } = req.params;
        const { status, resolutionComment, assignedToId: newAssignedToId } = req.body as QueryUpdatePayload;

        if (!status && resolutionComment === undefined && newAssignedToId === undefined) {
            return res.status(400).json({ message: 'At least one field (status, resolutionComment, or assignedToId) must be provided for update.' });
        }

        const queryToUpdate = await prisma.query.findUnique({
            where: { id: queryId },
            include: { parent: { select: { id: true, name: true, phone: true } }, student: { select: { name: true } } } // For notifications
        });

        if (!queryToUpdate) {
            return res.status(404).json({ message: 'Query not found.' });
        }

        // --- Authorization Checks ---
        // Rule: Teachers/Admin can only modify queries assigned to them, OR if it's unassigned and they pick it up.
        // Rule: Admins can modify any query (e.g., to reassign or resolve).
        let canUpdate = false;
        if (user.role === Role.ADMIN) {
            canUpdate = true; // Admins can update any query
        } else if (user.role === Role.TEACHER) {
            if (queryToUpdate.assignedToId === user.id) {
                canUpdate = true; // Teacher is assigned
            } else if (!queryToUpdate.assignedToId && (status || resolutionComment)) {
                // Teacher can pick up an unassigned query by updating its status/comment
                // When they do, it should be assigned to them.
                // This logic is implicit: if they update, it might auto-assign.
                // For now, let's require explicit assignment or that it's already assigned to them.
                // A better flow for "picking up" might be a separate action.
                // Let's stick to: Teacher can only modify if assignedToId === user.id
            }
        }

        if (!canUpdate && queryToUpdate.assignedToId !== user.id) { // Stricter check for teacher
            return res.status(403).json({ message: 'Forbidden: You can only modify queries assigned to you, or if you are an Admin.' });
        }

        // --- Prepare Data for Update ---
        const dataToUpdate: Prisma.QueryUpdateInput = {};
        let assignmentChanged = false;
        let statusChanged = false;

        if (status) {
            if (!Object.values(QueryStatus).includes(status)) {
                return res.status(400).json({ message: 'Invalid status value.' });
            }
            if (queryToUpdate.status !== status) statusChanged = true;
            dataToUpdate.status = status;
        }

        if (resolutionComment !== undefined) { // Allows setting to null or empty string
            dataToUpdate.resolutionComment = resolutionComment;
        }

        // Admin-only: Reassignment
        if (newAssignedToId !== undefined && user.role === Role.ADMIN) {
            if (newAssignedToId === null) { // Unassign
                dataToUpdate.assignedTo = { disconnect: true }; // Or assignedToId: null
                if (queryToUpdate.assignedToId) assignmentChanged = true;
            } else {
                // Verify the new assignee is a valid Teacher or Admin
                const newAssignee = await prisma.user.findFirst({
                    where: { id: newAssignedToId, role: { in: [Role.TEACHER, Role.ADMIN] } }
                });
                if (!newAssignee) {
                    return res.status(400).json({ message: `User with ID '${newAssignedToId}' is not a valid assignee (must be Teacher or Admin).` });
                }
                if (queryToUpdate.assignedToId !== newAssignedToId) assignmentChanged = true;
                dataToUpdate.assignedTo = { connect: { id: newAssignedToId } };
            }
        } else if (newAssignedToId !== undefined && user.role !== Role.ADMIN) {
            return res.status(403).json({ message: "Forbidden: Only Admins can reassign queries." });
        }

        const updatedQuery = await prisma.query.update({
            where: { id: queryId },
            data: dataToUpdate,
            include: {
                parent: { select: { id: true, name: true } },
                student: { select: { id: true, name: true } },
                assignedTo: { select: { id: true, name: true, role: true } },
            },
        });

        // --- Notifications ---
        // Notify parent if status changed or resolution comment added
        if ((statusChanged && updatedQuery.status === QueryStatus.RESOLVED) || (resolutionComment && queryToUpdate.resolutionComment !== resolutionComment)) {
            await notificationService.createAndSendNotification({
                userIdToNotify: updatedQuery.parent.id,
                type: updatedQuery.status === QueryStatus.RESOLVED ? 'QUERY_RESOLVED' : 'QUERY_UPDATED',
                relatedId: updatedQuery.id,
                context: {
                    querySubject: updatedQuery.subject,
                    studentName: updatedQuery.student?.name || 'N/A',
                    newStatus: updatedQuery.status,
                    resolution: updatedQuery.resolutionComment || undefined
                }
            });
        }

        // Notify new assignee if reassigned by admin
        if (assignmentChanged && updatedQuery.assignedToId && updatedQuery.assignedToId !== queryToUpdate.assignedToId) {
            await notificationService.createAndSendNotification({
                userIdToNotify: updatedQuery.assignedToId,
                type: 'QUERY_ASSIGNED',
                relatedId: updatedQuery.id,
                context: {
                    queryId: updatedQuery.id,
                    querySubject: updatedQuery.subject,
                    studentName: updatedQuery.student?.name || 'N/A',
                    parentName: updatedQuery.parent.name
                }
            });
        }

        return res.status(200).json(updatedQuery);
    } catch (error) {
        next(error);
    }
};