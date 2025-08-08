import { Gender, StudentActiveStatus } from '@prisma/client'; // 

export interface StudentCreateInput {
  name: string;
  currentClass: string;  // Changed from grade to currentClass to match Prisma schema
  section?: string;
  dateOfBirth?: Date | string;
  gender?: Gender;
  admissionNumber: string;
  admissionDate?: Date | string;
  status?: StudentActiveStatus;
  parentId?: string;
}

export interface StudentCreateAdminPayload { // Renamed for clarity to avoid conflict with Prisma type
  name: string;
  admissionNumber: string;
  currentClass: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: Gender;
  section?: string;
  admissionDate?: string; // YYYY-MM-DD, defaults to now() if not provided
  status?: StudentActiveStatus; // Defaults to ACTIVE if not provided
  // parentId can be added here if direct mapping during creation is desired
}

export interface StudentUpdatePayload { // For potential future update endpoint
  name?: string;
  dateOfBirth?: string;
  gender?: Gender;
  currentClass?: string;
  section?: string;
  admissionDate?: string;
  status?: StudentActiveStatus;
  parentId?: string | null;
}

export interface StudentMapParentInput {
  studentId: string;
  parentId: string; // This will be the User ID of the parent
}

export interface StudentDocumentMetadata {
  name: string;         // e.g., "Birth Certificate", "Previous Marksheet"
  url: string;          // Placeholder URL, e.g., "s3://bucket/path/to/file.pdf" or "local_stub/file.pdf"
  uploadedAt: string;   // ISO 8601 timestamp for when this metadata was added
  fileType?: string;     // Optional: e.g., "pdf", "jpg"
  size?: number;         // Optional: file size in bytes
}

export interface StudentUploadDocsPayload {
  documents: StudentDocumentMetadata[]; // An array of document metadata objects
}
