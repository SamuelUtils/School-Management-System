// src/models/query.types.ts
import { QueryStatus } from '.prisma/client';

// No changes needed for QueryStatus if already defined: OPEN | IN_PROGRESS | RESOLVED

export interface ParentQueryCreatePayload {
    studentId: string; // Required: The ID of the student this query is about
    subject: string;   // Required: Subject/title of the query
    message: string;   // Required: The detailed query message
}

export interface QueryUpdatePayload {
    status?: QueryStatus;
    response?: string;
    resolutionComment?: string | null;
    assignedToId?: string | null;
}