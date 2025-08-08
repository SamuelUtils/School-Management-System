import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { UserCreateInput } from '@/models/user.types';
import { StudentCreateInput, StudentCreateAdminPayload, StudentMapParentInput, StudentDocumentMetadata, StudentUploadDocsPayload } from '@/models/student.types';
import { hashPassword } from '@/lib/auth.utils';
import { Role, Gender, StudentActiveStatus, DayOfWeek } from '.prisma/client';
import { FeeCategoryCreateInput, StudentFeeAssignInput } from '@/models/fee.types';
import { PrismaClient, Prisma } from '@prisma/client';
import { FeePaymentCreateInput } from '@/models/payment.types';
import { generateReceiptNumber } from '@/lib/receipt.utils';
import { notificationService, NotificationType } from '@/lib/notification.service';
import { TimetableSlotPayload, AlternateTimetablePayload, AssignSubstitutePayload } from '@/models/timetable.types';
import { isValidTimeFormat, timeToMinutes, doTimeSlotsOverlap, getDayOfWeekFromDate } from '@/lib/time.utils';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Define interfaces for the types we need
interface TimetableSlotWithDay {
  dayOfWeek: DayOfWeek | null;
  startTime: string;
  endTime: string;
  date: Date | null;
  [key: string]: any;
}

// Create a new Parent (which is a User with Role.PARENT)
export const createParent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phone, password } = req.body as Omit<UserCreateInput, 'role' | 'passwordHash'> & { password?: string };

    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'Name, phone, and password are required for parent creation' });
    }

    // Check if phone already exists for any user
    const existingUser = await prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      return res.status(409).json({ message: 'Phone number already in use.' });
    }

    const passwordHash = await hashPassword(password);

    const newParent = await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash,
        role: Role.PARENT,
      },
    });

    const { passwordHash: _, ...parentWithoutPassword } = newParent;
    return res.status(201).json(parentWithoutPassword);
  } catch (error) {
    next(error);
  }
};

// Create a new Student
export const createStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, currentClass, section, dateOfBirth, gender, admissionNumber, status } = req.body as StudentCreateInput;

    // Validate required fields
    if (!name || !currentClass || !admissionNumber) {
      return res.status(400).json({ message: 'Name, Admission Number, and Class are required.' });
    }

    // Validate gender if provided
    if (gender && !Object.values(Gender).includes(gender)) {
      return res.status(400).json({ message: `Invalid gender value. Allowed: ${Object.values(Gender).join(', ')}` });
    }

    // Validate status if provided
    if (status && !Object.values(StudentActiveStatus).includes(status)) {
      return res.status(400).json({ message: `Invalid status value. Allowed: ${Object.values(StudentActiveStatus).join(', ')}` });
    }

    const newStudent = await prisma.student.create({
      data: {
        name,
        currentClass,
        section,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        admissionNumber,
        status: status || StudentActiveStatus.ACTIVE,
      }
    });

    return res.status(201).json({
      id: newStudent.id,
      name: newStudent.name,
      currentClass: newStudent.currentClass,
      section: newStudent.section,
      dateOfBirth: newStudent.dateOfBirth ? newStudent.dateOfBirth.toISOString().split('T')[0] : null,
      gender: newStudent.gender,
      admissionNumber: newStudent.admissionNumber,
      status: newStudent.status,
      admissionDate: newStudent.admissionDate.toISOString().split('T')[0],
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'Admission number already exists.' });
    }
    // console.error('Error creating student:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Map a Parent (User with Role.PARENT) to a Student
export const mapParentToStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, parentId } = req.body as StudentMapParentInput;

    if (!studentId || !parentId) {
      return res.status(400).json({ message: 'Student ID and Parent ID are required' });
    }

    // 1. Check if student exists
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // 2. Check if parent (User) exists and has PARENT role
    const parentUser = await prisma.user.findUnique({ where: { id: parentId } });
    if (!parentUser) {
      return res.status(404).json({ message: 'Parent user not found' });
    }
    if (parentUser.role !== Role.PARENT) {
      return res.status(400).json({ message: 'Specified user is not a Parent' });
    }

    // 3. Check if student is already mapped to this parent or any parent
    if (student.parentId) {
      if (student.parentId === parentId) {
        return res.status(409).json({ message: 'Student is already mapped to this parent' });
      }
      // If you want to allow re-mapping (changing parent), you'd handle that here.
      // For now, let's assume a student can only be mapped once if parentId is set.
      // Or, if a student can only have ONE parent ever:
      return res.status(409).json({ message: 'Student is already mapped to another parent. Unmap first to change.' });
    }

    // 4. Perform the mapping
    const updatedStudent = await prisma.student.update({
      where: { id: studentId },
      data: {
        parentId: parentId,
      },
      include: { // Optionally include parent details in response
        parent: {
          select: { id: true, name: true, phone: true }
        }
      }
    });

    return res.status(200).json({ message: 'Parent successfully mapped to student', student: updatedStudent });
  } catch (error) {
    next(error);
  }
};

export const createFeeCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, baseAmount } = req.body as FeeCategoryCreateInput;
    const adminId = req.user!.userId; // Admin performing the action

    if (!name || typeof baseAmount !== 'number' || baseAmount < 0) {
      return res.status(400).json({ message: 'Name and a non-negative baseAmount are required.' });
    }

    const newFeeCategory = await prisma.feeCategory.create({
      data: {
        name,
        description,
        baseAmount,
        // Note: We're not linking createdBy here, but could if needed
      },
    });
    return res.status(201).json(newFeeCategory);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[])?.join(', ') || 'unknown field';
      return res.status(409).json({ message: `Fee category with name '${target}' already exists.` });
    }
    next(error);
  }
};

export const listFeeCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.feeCategory.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
};


// --- Student Fee Assignment ---

export const assignFeeToStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, feeCategoryId, discountAmount = 0 } = req.body as StudentFeeAssignInput;
    const assignedById = req.user!.userId; // Admin performing the action

    if (!studentId || !feeCategoryId) {
      return res.status(400).json({ message: 'Student ID and Fee Category ID are required.' });
    }
    if (typeof discountAmount !== 'number' || discountAmount < 0) {
      return res.status(400).json({ message: 'Discount amount must be a non-negative number.' });
    }

    // 1. Fetch student and fee category in parallel
    const [student, feeCategory] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.feeCategory.findUnique({ where: { id: feeCategoryId } }),
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    if (!feeCategory) {
      return res.status(404).json({ message: 'Fee category not found.' });
    }

    // 2. Calculate assignedAmount
    let assignedAmount = feeCategory.baseAmount - discountAmount;
    if (assignedAmount < 0) {
      assignedAmount = 0; // Amount cannot be negative
    }
    if (discountAmount > feeCategory.baseAmount) {
      // Optionally, log a warning or handle this case explicitly if discount exceeds base amount
      // console.warn(`Discount (${discountAmount}) for fee category '${feeCategory.name}' exceeds base amount (${feeCategory.baseAmount}) for student ${studentId}. Assigned amount set to 0.`);
    }


    // 3. Create StudentFee (Prisma will handle unique constraint for studentId + feeCategoryId)
    const newStudentFee = await prisma.studentFee.create({
      data: {
        studentId,
        feeCategoryId,
        assignedAmount,
        discountAmount,
        assignedById,
      },
      include: { // Optionally include details in response
        student: { select: { id: true, name: true } },
        feeCategory: { select: { id: true, name: true, baseAmount: true } }
      }
    });
    if (newStudentFee) {
      await notificationService.createAndSendNotification({
        userIdToNotify: student.parentId || '',
        type: 'FEE_ASSIGNED',
        relatedId: newStudentFee.id,
        context: {
          studentName: student.name,
          feeCategoryName: feeCategory.name,
          amount: assignedAmount
        }
      });
    }

    return res.status(201).json(newStudentFee);

  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'This fee category is already assigned to this student.' });
      }
      if (error.code === 'P2003') {
        const fieldName = (error.meta?.field_name as string) || 'related record';
        return res.status(400).json({ message: `Invalid reference: ${fieldName} not found.` });
      }
    }
    next(error);
  }
};

export const recordFeePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentFeeId, paidAmount, paymentDate: paymentDateString, mode, notes } = req.body as FeePaymentCreateInput;
    const createdById = req.user!.userId; // Admin performing the action

    if (!studentFeeId || typeof paidAmount !== 'number' || paidAmount <= 0 || !paymentDateString || !mode) {
      return res.status(400).json({ message: 'StudentFee ID, positive Paid Amount, Payment Date, and Mode are required.' });
    }

    const paymentDate = new Date(paymentDateString);
    if (isNaN(paymentDate.getTime())) {
      return res.status(400).json({ message: 'Invalid paymentDate format. Please use YYYY-MM-DD.' });
    }
    const normalizedPaymentDate = new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), paymentDate.getUTCDate()));


    // 1. Fetch the StudentFee record to get studentId, feeCategoryId, and calculate due amount
    const studentFee = await prisma.studentFee.findUnique({
      where: { id: studentFeeId },
      include: {
        student: true, // To get studentId for the FeePayment record
        feeCategory: true,
        payments: { select: { paidAmount: true } }, // To calculate total paid so far
      },
    });

    if (!studentFee) {
      return res.status(404).json({ message: 'StudentFee record not found. Ensure fee is assigned to student first.' });
    }

    // 2. Calculate total already paid for this StudentFee
    const totalAlreadyPaid = studentFee.payments.reduce((sum: number, payment: { paidAmount: number }) => sum + payment.paidAmount, 0);
    const dueAmount = studentFee.assignedAmount - totalAlreadyPaid;

    if (paidAmount > dueAmount) {
      return res.status(400).json({
        message: `Paid amount (${paidAmount}) exceeds due amount (${dueAmount.toFixed(2)}).`,
        dueAmount: dueAmount.toFixed(2),
        totalAlreadyPaid: totalAlreadyPaid.toFixed(2),
        assignedAmount: studentFee.assignedAmount.toFixed(2)
      });
    }

    // 3. Generate unique receipt number (with retry logic for safety, though DB unique constraint is primary)
    let receiptNumber;
    let retries = 0;
    const maxRetries = 5; // Safety break for receipt generation
    while (retries < maxRetries) {
      receiptNumber = await generateReceiptNumber();
      const existingReceipt = await prisma.feePayment.findUnique({ where: { receiptNumber } });
      if (!existingReceipt) break; // Unique number found
      retries++;
      if (retries >= maxRetries) {
        // This should be extremely rare with a good generation strategy and unique constraint
        console.error("Failed to generate a unique receipt number after multiple retries.");
        return res.status(500).json({ message: "Could not generate a unique receipt number. Please try again." });
      }
    }
    if (!receiptNumber) { // Should not happen if loop completes or breaks
      return res.status(500).json({ message: "Receipt number generation failed unexpectedly." });
    }


    // 4. Create FeePayment record
    const newFeePayment = await prisma.feePayment.create({
      data: {
        studentFeeId,
        studentId: studentFee.studentId, // Get studentId from the fetched studentFee
        paidAmount,
        paymentDate: normalizedPaymentDate,
        mode,
        notes,
        receiptNumber,
        createdById,
      },
      include: { // Include details for response
        student: { select: { id: true, name: true } },
        studentFee: {
          include: {
            feeCategory: { select: { name: true } }
          }
        }
      }
    });

    // 5. Stubbed Notification call (e.g., to parent about payment received)
    // if (studentFee.student.parentId) {
    //     const parent = await prisma.user.findUnique({where: {id: studentFee.student.parentId}});
    //     if (parent && parent.phone) {
    //         await notificationService.sendNotification({
    //             to: parent.phone,
    //             message: `Payment of ${paidAmount} for ${studentFee.feeCategory.name} (Receipt: ${receiptNumber}) received for ${studentFee.student.name}. Thank you.`
    //         });
    //     }
    // }

    await notificationService.createAndSendNotification({
      userIdToNotify: studentFee.student.parentId || '',
      type: 'PAYMENT_RECEIVED',
      relatedId: newFeePayment.id,
      context: {
        studentName: studentFee.student.name,
        feeCategoryName: studentFee.feeCategory.name,
        amount: newFeePayment.paidAmount,
        receiptNumber: newFeePayment.receiptNumber
      }
    });

    return res.status(201).json(newFeePayment);

  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        const fieldName = (error.meta?.field_name as string) || 'related record';
        return res.status(400).json({ message: `Invalid reference: ${fieldName} not found.` });
      }
      if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('receiptNumber')) {
        return res.status(500).json({ message: "Failed to save payment due to a receipt number conflict. Please try again." });
      }
    }
    next(error);
  }
};

export const listStudentPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;

    // Check if student exists
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const payments = await prisma.feePayment.findMany({
      where: { studentId },
      orderBy: { paymentDate: 'desc' },
      include: {
        studentFee: {
          include: {
            feeCategory: { select: { name: true } },
          },
        },
        createdBy: { select: { name: true } }, // Admin who recorded it
      },
    });

    return res.status(200).json(payments);
  } catch (error) {
    next(error);
  }
};

export const sendOverdueFeeReminder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentFeeId } = req.params; // Assuming studentFeeId is passed in URL
    // const adminId = req.user!.userId; // Admin triggering this

    const studentFee = await prisma.studentFee.findUnique({
      where: { id: studentFeeId },
      include: {
        student: true,
        feeCategory: true,
        payments: { select: { paidAmount: true } },
      }
    });

    if (!studentFee) {
      return res.status(404).json({ message: "StudentFee record not found." });
    }

    const totalPaid = studentFee.payments.reduce((sum: number, p: { paidAmount: number }) => sum + p.paidAmount, 0);
    const amountDue = studentFee.assignedAmount - totalPaid;

    if (amountDue <= 0) {
      return res.status(400).json({ message: "This fee is already fully paid or has no dues." });
    }

    // In a real system, you'd also check a due_date field on StudentFee
    // For now, we just send if an admin triggers it and amountDue > 0

    await notificationService.createAndSendNotification({
      userIdToNotify: studentFee.student.parentId || '',
      type: 'FEE_OVERDUE_REMINDER',
      relatedId: studentFee.id,
      context: {
        studentName: studentFee.student.name,
        feeCategoryName: studentFee.feeCategory.name,
        amount: amountDue
      }
    });

    return res.status(200).json({ message: "Overdue fee reminder sent.", studentFeeId, amountDue });

  } catch (error) {
    next(error);
  }
};

export const createStudentViaAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      admissionNumber,
      currentClass, // Renamed to avoid keyword clash in JS
      section,
      dateOfBirth: dobString,
      gender,
      admissionDate: admissionDateString,
      status,
    } = req.body as StudentCreateAdminPayload;

    // --- Core Validations ---
    if (!name || !admissionNumber || !currentClass) {
      return res.status(400).json({ message: 'Name, Admission Number, and Class are required.' });
    }

    // --- Format Validations ---
    // Class: Example - allow alphanumeric, spaces, hyphens. Adjust regex as needed.
    // e.g., "10", "Grade 5", "UKG-Morning"
    if (!/^[a-zA-Z0-9\s\-]+$/.test(currentClass) || currentClass.length > 50) {
      return res.status(400).json({ message: 'Class format is invalid or too long (max 50 chars, alphanumeric, space, hyphen).' });
    }
    // Section: Example - single uppercase letter A-Z, or can be more complex if needed.
    if (section && (!/^[A-Z]$/.test(section) && !/^[a-zA-Z0-9\s\-]{1,10}$/.test(section))) { // Allows "A" or "Section Alpha"
      return res.status(400).json({ message: 'Section format is invalid (e.g., A, B, or short name like "Blue", max 10 chars).' });
    }


    // --- Date and Enum Validations ---
    let dateOfBirth: Date | undefined = undefined;
    if (dobString) {
      dateOfBirth = new Date(dobString);
      if (isNaN(dateOfBirth.getTime()) || dobString.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(dobString)) {
        return res.status(400).json({ message: 'Invalid Date of Birth format. Please use YYYY-MM-DD.' });
      }
    }

    let admissionDate: Date | undefined = undefined; // Will default in Prisma if not provided here as undefined
    if (admissionDateString) {
      admissionDate = new Date(admissionDateString);
      if (isNaN(admissionDate.getTime()) || admissionDateString.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(admissionDateString)) {
        return res.status(400).json({ message: 'Invalid Admission Date format. Please use YYYY-MM-DD.' });
      }
    }

    if (gender && !Object.values(Gender).includes(gender)) {
      return res.status(400).json({ message: `Invalid gender value. Allowed: ${Object.values(Gender).join(', ')}` });
    }
    if (status && !Object.values(StudentActiveStatus).includes(status)) {
      return res.status(400).json({ message: `Invalid status value. Allowed: ${Object.values(StudentActiveStatus).join(', ')}` });
    }
    // --- End Validations ---

    const studentDataToCreate = {
      name,
      admissionNumber,
      currentClass,
      section: section || null,
      status: status || StudentActiveStatus.ACTIVE,
      ...(dateOfBirth && { dateOfBirth: new Date(Date.UTC(dateOfBirth.getFullYear(), dateOfBirth.getMonth(), dateOfBirth.getDate())) }),
      ...(admissionDate && { admissionDate: new Date(Date.UTC(admissionDate.getFullYear(), admissionDate.getMonth(), admissionDate.getDate())) }),
      ...(gender && { gender }),
    };

    const newStudent = await prisma.student.create({
      data: studentDataToCreate,
    });

    // Convert dates back to YYYY-MM-DD strings for consistent response, if desired
    const responseStudent = {
      ...newStudent,
      dateOfBirth: newStudent.dateOfBirth ? newStudent.dateOfBirth.toISOString().split('T')[0] : null,
      admissionDate: newStudent.admissionDate.toISOString().split('T')[0],
    };

    return res.status(201).json(responseStudent);

  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('admissionNumber')) {
        return res.status(409).json({ message: 'Admission number already exists.' });
      }
    }
    next(error);
  }
};

// GET /admin/students - List all students (Admin Only)
export const listStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const students = await prisma.student.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const formattedStudents = students.map((student: {
      dateOfBirth: Date | null;
      admissionDate: Date;
      [key: string]: any;
    }) => ({
      ...student,
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().split('T')[0] : null,
      admissionDate: student.admissionDate.toISOString().split('T')[0],
    }));

    return res.status(200).json(formattedStudents);
  } catch (error) {
    next(error);
  }
};

export const uploadStudentDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: studentId } = req.params;
    const { documents: newDocumentsToUpload } = req.body as StudentUploadDocsPayload;
    // const adminId = req.user!.userId; // For auditing who uploaded if needed

    if (!Array.isArray(newDocumentsToUpload)) {
      return res.status(400).json({ message: 'Documents field must be an array.' });
    }

    // Validate each document metadata object
    for (const doc of newDocumentsToUpload) {
      if (!doc.name || !doc.url || !doc.uploadedAt) { // uploadedAt is now expected from client for this stub
        return res.status(400).json({ message: 'Each document must have a name, url, and uploadedAt timestamp.' });
      }
      // Basic URL validation (very simple, can be enhanced)
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(doc.url) && !/^stub:\/\//i.test(doc.url) && !/^placeholder:/i.test(doc.url)) {
        // Allowing common URL patterns or our stub prefixes
        // console.warn(`Potential invalid URL format for stub: ${doc.url}`);
        // For a stub, we might be more lenient, but for real URLs, validation is key.
      }
      try {
        new Date(doc.uploadedAt); // Check if uploadedAt is a valid date string
      } catch (e) {
        return res.status(400).json({ message: `Invalid uploadedAt date format for document '${doc.name}'. Use ISO 8601.` });
      }
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { documents: true } // Select only existing documents
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Current documents - Prisma stores JSON as Prisma.JsonValue
    // We need to cast it to our expected array type or handle it as potentially null.
    const existingDocuments = (student.documents as StudentDocumentMetadata[] | null) || [];

    // --- Stubbed Functionality: Merging new document metadata ---
    // In a real scenario with actual uploads:
    // 1. Files would be uploaded to a storage provider.
    // 2. URLs from the storage provider would be used here.
    // 3. You might want to check for duplicate file names or implement versioning.

    const updatedDocuments = [...existingDocuments, ...newDocumentsToUpload];

    const updatedStudent = await prisma.student.update({
      where: { id: studentId },
      data: {
        documents: updatedDocuments as any, // Type assertion needed since documents is a JSON field
      },
      select: { id: true, name: true, documents: true }
    });

    // Format documents for response if needed (e.g., date strings)
    const responseDocs = (updatedStudent.documents as StudentDocumentMetadata[] | null || []).map(doc => ({
      ...doc,
      uploadedAt: new Date(doc.uploadedAt).toISOString() // Ensure consistent ISO string
    }));


    return res.status(200).json({
      message: 'Document metadata successfully added. (Placeholder - no actual files uploaded)',
      studentId: updatedStudent.id,
      documents: responseDocs,
    });

  } catch (error) {
    next(error);
  }
};

// GET /admin/students/:id/docs - Retrieve document metadata for a student
export const getStudentDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: studentId } = req.params;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, documents: true },
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const documents = (student.documents as StudentDocumentMetadata[] | null) || [];

    // Format documents for response
    const formattedDocuments = documents.map(doc => ({
      ...doc,
      uploadedAt: new Date(doc.uploadedAt).toISOString()
    }));


    // --- Stubbed Functionality: Viewing/Downloading ---
    // In a real app, the 'url' would point to an actual file.
    // A client might use these URLs to download/view.
    // This endpoint just returns the metadata.

    return res.status(200).json({
      studentId: student.id,
      studentName: student.name,
      documents: formattedDocuments,
      _note: "URLs are placeholders. Actual file viewing/download not implemented."
    });

  } catch (error) {
    next(error);
  }
};

export const createOrUpdateTimetableSlot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { id, dayOfWeek, startTime, endTime, currentClass, section, subject, teacherId, date } = req.body as TimetableSlotPayload;

    // --- Validations ---
    if (!dayOfWeek || !startTime || !endTime || !currentClass || !subject) {
      return res.status(400).json({ message: 'Day of week, start time, end time, currentClass, and subject are required.' });
    }
    if (!Object.values(DayOfWeek).includes(dayOfWeek)) {
      return res.status(400).json({ message: 'Invalid dayOfWeek value.' });
    }
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
      return res.status(400).json({ message: 'Invalid startTime or endTime format. Use HH:MM.' });
    }
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      return res.status(400).json({ message: 'Start time must be before end time.' });
    }
    if (teacherId === '') teacherId = null; // Treat empty string as null
    if (section === '') section = null; // Treat empty string as null

    // Optional: Validate teacherId if provided (exists and is a TEACHER)
    if (teacherId) {
      const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: Role.TEACHER } });
      if (!teacher) {
        return res.status(400).json({ message: `Teacher with ID '${teacherId}' not found or is not a teacher.` });
      }
    }
    // --- End Validations ---


    // --- Conflict Detection ---
    // 1. Teacher conflict: Is this teacher already assigned to another slot at the same time?
    if (teacherId) {
      const conflictingTeacherSlots = await prisma.timetableSlot.findMany({
        where: {
          teacherId: teacherId,
          dayOfWeek: dayOfWeek,
          id: id ? { not: id } : undefined, // Exclude current slot if updating
          // Check for time overlap
          // This Prisma query for overlap is complex. We simplify by fetching and checking in code.
          // A more robust way is complex OR conditions or checking if
          // (slot.startTime < new.endTime AND slot.endTime > new.startTime)
        }
      });

      for (const existingSlot of conflictingTeacherSlots) {
        if (doTimeSlotsOverlap(existingSlot.startTime, existingSlot.endTime, startTime, endTime)) {
          return res.status(409).json({
            message: `Teacher conflict: Teacher is already assigned to class '${existingSlot.currentClass}' subject '${existingSlot.subject}' during this time.`,
            conflictingSlot: existingSlot
          });
        }
      }
    }

    // 2. Class/Section conflict: Is this class/section already having another subject (or same subject by different teacher) at this time?
    // The unique constraint `@@unique([dayOfWeek, startTime, class, section, subject])` handles same subject.
    // We need to check for *any* subject in the same class/section/time.
    const conflictingClassSlots = await prisma.timetableSlot.findMany({
      where: {
        currentClass: currentClass,
        section: section || null,
        dayOfWeek: dayOfWeek,
        id: id ? { not: id } : undefined, // Exclude current slot if updating
      }
    });

    for (const existingSlot of conflictingClassSlots) {
      if (doTimeSlotsOverlap(existingSlot.startTime, existingSlot.endTime, startTime, endTime)) {
        return res.status(409).json({
          message: `Class/Section conflict: Class '${currentClass}' ${section || ''} already has subject '${existingSlot.subject}' scheduled during this time.`,
          conflictingSlot: existingSlot
        });
      }
    }
    // --- End Conflict Detection ---

    const slotData = {
      dayOfWeek,
      startTime,
      endTime,
      currentClass,
      section: section || null,
      subject,
      teacherId: teacherId || null,
      date: date ? new Date(Date.UTC(new Date(date).getUTCFullYear(), new Date(date).getUTCMonth(), new Date(date).getUTCDate())) : null
    };

    const slot = id
      ? await prisma.timetableSlot.update({ where: { id }, data: slotData })
      : await prisma.timetableSlot.create({ data: slotData });

    // Format the response
    return res.status(id ? 200 : 201).json({
      ...slot,
      date: slot.date ? slot.date.toISOString().split('T')[0] : null
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // More specific unique constraint error for class_subject_period_unique
        if ((error.meta?.target as string[])?.includes('dayOfWeek') && (error.meta?.target as string[])?.includes('startTime') && (error.meta?.target as string[])?.includes('subject')) {
          return res.status(409).json({ message: `This exact subject slot (day, time, class, section, subject) already exists.` });
        }
      }
    }
    next(error);
  }
};

// POST /admin/alternate-timetable - Create/replace timetable for a specific date
export const setAlternateTimetable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date: dateString, slots: alternateSlotsData } = req.body as AlternateTimetablePayload;
    const adminId = req.user!.userId;

    if (!dateString || !Array.isArray(alternateSlotsData)) {
      return res.status(400).json({ message: 'A specific date (YYYY-MM-DD) and an array of slots are required.' });
    }

    const alternateDate = new Date(dateString);
    if (isNaN(alternateDate.getTime()) || dateString.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD.' });
    }
    // Normalize to UTC midnight for storage and consistent querying
    const normalizedAlternateDate = new Date(Date.UTC(alternateDate.getUTCFullYear(), alternateDate.getUTCMonth(), alternateDate.getUTCDate()));
    const dayOfWeekForAlternateDate = getDayOfWeekFromDate(normalizedAlternateDate);


    // --- Validate all incoming slots first ---
    for (const slotData of alternateSlotsData) {
      if (!slotData.startTime || !slotData.endTime || !slotData.currentClass || !slotData.subject) {
        return res.status(400).json({ message: 'Each slot must have startTime, endTime, currentClass, and subject.' });
      }
      if (!isValidTimeFormat(slotData.startTime) || !isValidTimeFormat(slotData.endTime)) {
        return res.status(400).json({ message: `Invalid time format in slot for subject '${slotData.subject}'. Use HH:MM.` });
      }
      if (timeToMinutes(slotData.startTime) >= timeToMinutes(slotData.endTime)) {
        return res.status(400).json({ message: `StartTime must be before endTime in slot for subject '${slotData.subject}'.` });
      }
      if (slotData.teacherId === '') slotData.teacherId = null;
      if (slotData.section === '') slotData.section = null;

      if (slotData.teacherId) {
        const teacher = await prisma.user.findFirst({ where: { id: slotData.teacherId, role: Role.TEACHER } });
        if (!teacher) {
          return res.status(400).json({ message: `Teacher with ID '${slotData.teacherId}' for subject '${slotData.subject}' not found or is not a teacher.` });
        }
      }
    }

    // --- Conflict Detection within the provided alternate slots for the specific date ---
    // (This is more complex: check for teacher clashes and class/section clashes *within the submitted list*)
    // For simplicity in this example, we'll rely on the subsequent DB operations to catch some of this,
    // but robust validation should check the payload itself first.
    // Example: Check for duplicate (class, section, startTime) in alternateSlotsData

    // --- Transaction: Delete existing alternate slots for this date, then create new ones ---
    const createdSlots = await prisma.$transaction(async (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => {
      // 1. Delete all existing TimetableSlots for this specific 'date'
      await tx.timetableSlot.deleteMany({
        where: { date: normalizedAlternateDate },
      });

      // 2. Create the new alternate slots for this 'date'
      const newSlots = [];
      for (const slotData of alternateSlotsData) {
        // Conflict detection against other new slots being added in this transaction (more robust)
        // And teacher availability on this specific date if they have other date-specific commitments.
        // The existing createOrUpdateTimetableSlot has more detailed conflict checks that could be adapted.
        // For now, let's keep it simpler and rely on DB constraints mostly for direct overlaps.

        // Check for teacher conflicts within the new set of alternate slots for this date
        const teacherConflictInPayload = alternateSlotsData.filter(s =>
          s.teacherId && s.teacherId === slotData.teacherId && s !== slotData && // different slot object
          doTimeSlotsOverlap(s.startTime, s.endTime, slotData.startTime, slotData.endTime)
        );
        if (teacherConflictInPayload.length > 0) {
          throw new Error(`Teacher conflict within the submitted alternate schedule for teacher ID ${slotData.teacherId} and subject ${slotData.subject}.`);
        }
        // Check for class/section conflicts within the new set of alternate slots for this date
        const classConflictInPayload = alternateSlotsData.filter(s =>
          s.currentClass === slotData.currentClass && (s.section || null) === (slotData.section || null) && s !== slotData &&
          doTimeSlotsOverlap(s.startTime, s.endTime, slotData.startTime, slotData.endTime)
        );
        if (classConflictInPayload.length > 0) {
          throw new Error(`Class/Section conflict within the submitted alternate schedule for class ${slotData.currentClass} ${slotData.section || ''} and subject ${slotData.subject}.`);
        }

        const created = await tx.timetableSlot.create({
          data: {
            dayOfWeek: dayOfWeekForAlternateDate,
            startTime: slotData.startTime,
            endTime: slotData.endTime,
            currentClass: slotData.currentClass,
            section: slotData.section || null,
            subject: slotData.subject,
            teacherId: slotData.teacherId || null,
            date: normalizedAlternateDate,
          },
        });
        newSlots.push(created);
      }
      return newSlots;
    });

    return res.status(201).json({
      message: `Alternate timetable for ${dateString} set successfully.`,
      date: dateString,
      slots: createdSlots,
    });

  } catch (error) {
    // Handle P2002 for the @@unique constraint on TimetableSlot
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'A timetable slot conflict occurred. One or more slots (day, time, class, section, subject, date) might already exist or conflict within the submission.' });
    }
    if (error instanceof Error && (error.message.includes("Teacher conflict within") || error.message.includes("Class/Section conflict within"))) {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};


// --- Update Querying Logic to Prioritize Date-Specific Slots ---

export const getTimetableForClassSection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { class: studentClass, section } = req.params;
    const queryDateString = req.query.date as string | undefined;

    if (!studentClass) {
      return res.status(400).json({ message: "Class parameter is required." });
    }

    let targetDate: Date | null = null;
    let targetDayOfWeek: DayOfWeek | null = null;

    if (queryDateString) {
      const parsedDate = new Date(queryDateString);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid query date format. Use YYYY-MM-DD." });
      }
      targetDate = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()));
      targetDayOfWeek = getDayOfWeekFromDate(targetDate);
    }

    let slots;
    if (targetDate) {
      // If a specific date is queried, fetch slots for THAT date (alternate or regular if no alternate)
      const alternateSlots = await prisma.timetableSlot.findMany({
        where: {
          currentClass: studentClass,
          section: section || null,
          date: targetDate,
        },
        include: { teacher: { select: { id: true, name: true } } },
      });

      if (alternateSlots.length > 0) {
        slots = alternateSlots;
      } else {
        if (!targetDayOfWeek) targetDayOfWeek = getDayOfWeekFromDate(targetDate);
        slots = await prisma.timetableSlot.findMany({
          where: {
            currentClass: studentClass,
            section: section || null,
            dayOfWeek: targetDayOfWeek,
            date: null,
          },
          include: { teacher: { select: { id: true, name: true } } },
        });
      }
    } else {
      slots = await prisma.timetableSlot.findMany({
        where: {
          currentClass: studentClass,
          section: section || null,
          date: null,
        },
        include: { teacher: { select: { id: true, name: true } } },
      });
    }

    const dayOrder: Record<DayOfWeek, number> = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };
    const sortedSlots = slots.sort((a: TimetableSlotWithDay, b: TimetableSlotWithDay) => {
      if (a.dayOfWeek && b.dayOfWeek) {
        const dayDiff = dayOrder[a.dayOfWeek] - dayOrder[b.dayOfWeek];
        if (dayDiff !== 0) return dayDiff;
      }
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    return res.status(200).json(sortedSlots.map((slot: TimetableSlotWithDay) => ({
      ...slot,
      date: slot.date ? slot.date.toISOString().split('T')[0] : null
    })));
  } catch (error) {
    next(error);
  }
};


// Update Teacher's Timetable View as well
// src/controllers/teacher.controller.ts
export const getTeacherTimetable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacherId = req.user!.userId;
    const queryDateString = req.query.date as string | undefined; // ?date=YYYY-MM-DD

    let slots;
    if (queryDateString) {
      const parsedDate = new Date(queryDateString);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid query date format. Use YYYY-MM-DD." });
      }
      const targetDate = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()));
      const targetDayOfWeek = getDayOfWeekFromDate(targetDate);

      const alternateSlots = await prisma.timetableSlot.findMany({
        where: { teacherId, date: targetDate }
      });
      if (alternateSlots.length > 0) {
        slots = alternateSlots;
      } else {
        slots = await prisma.timetableSlot.findMany({
          where: { teacherId, dayOfWeek: targetDayOfWeek, date: null }
        });
      }
    } else {
      // No date query, return all regular (non-date-specific) slots for the teacher
      slots = await prisma.timetableSlot.findMany({
        where: { teacherId, date: null }
      });
    }

    const dayOrder: Record<DayOfWeek, number> = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };
    const sortedSlots = slots.sort((a: TimetableSlotWithDay, b: TimetableSlotWithDay) => {
      if (a.dayOfWeek && b.dayOfWeek) {
        const dayDiff = dayOrder[a.dayOfWeek] - dayOrder[b.dayOfWeek];
        if (dayDiff !== 0) return dayDiff;
      }
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    return res.status(200).json(sortedSlots);
  } catch (error) {
    next(error);
  }
};

export const assignSubstituteTeacher = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timetableSlotId, substituteTeacherId } = req.body as AssignSubstitutePayload;
    const adminId = req.user!.userId;

    if (!timetableSlotId || !substituteTeacherId) {
      return res.status(400).json({ message: 'Timetable Slot ID and Substitute Teacher ID are required.' });
    }

    // 1. Fetch the TimetableSlot
    const slotToUpdate = await prisma.timetableSlot.findUnique({
      where: { id: timetableSlotId },
    });

    if (!slotToUpdate) {
      return res.status(404).json({ message: 'Timetable slot not found.' });
    }

    // 2. Verify the substituteTeacherId is a valid TEACHER
    const substituteTeacher = await prisma.user.findFirst({
      where: { id: substituteTeacherId, role: Role.TEACHER },
    });

    if (!substituteTeacher) {
      return res.status(400).json({ message: `User with ID '${substituteTeacherId}' is not a valid substitute teacher.` });
    }

    // 3. Edge case: Prevent teacher from substituting themselves (for the original teacher slot)
    if (slotToUpdate.teacherId && slotToUpdate.teacherId === substituteTeacherId) {
      return res.status(400).json({ message: 'Teacher cannot be assigned as a substitute for their own original slot.' });
    }

    // 4. Conflict Check: Is the substitute teacher free during this slot's time?
    const substituteConflicts = await prisma.timetableSlot.findMany({
      where: {
        OR: [
          { teacherId: substituteTeacherId },
          { substituteTeacherId: substituteTeacherId }
        ],
        dayOfWeek: slotToUpdate.dayOfWeek,
        date: slotToUpdate.date,
        id: { not: timetableSlotId },
      }
    });

    for (const existingSlot of substituteConflicts) {
      if (doTimeSlotsOverlap(existingSlot.startTime, existingSlot.endTime, slotToUpdate.startTime, slotToUpdate.endTime)) {
        return res.status(409).json({
          message: 'Substitute teacher conflict: Teacher is already assigned to another slot during this time.',
          conflictingSlot: {
            id: existingSlot.id,
            currentClass: existingSlot.currentClass,
            subject: existingSlot.subject,
            startTime: existingSlot.startTime,
            endTime: existingSlot.endTime,
          }
        });
      }
    }

    // 5. Check if this teacher is already the substitute for this slot
    if (slotToUpdate.substituteTeacherId === substituteTeacherId) {
      return res.status(409).json({ message: "Substitute teacher conflict" });
    }

    // 6. Update the slot
    const updatedSlot = await prisma.timetableSlot.update({
      where: { id: timetableSlotId },
      data: {
        substituteTeacherId: substituteTeacherId,
      },
      include: { teacher: true, substituteTeacher: true }
    });

    return res.status(200).json({ message: 'Substitute teacher assigned successfully.', slot: updatedSlot });

  } catch (error) {
    next(error);
  }
};

// To clear a substitute: Admin could send POST /admin/substitute with substituteTeacherId: null
// Or a dedicated endpoint POST /admin/substitute/clear
export const clearSubstituteTeacher = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timetableSlotId } = req.body as { timetableSlotId: string }; // Simple payload

    if (!timetableSlotId) {
      return res.status(400).json({ message: 'Timetable Slot ID is required.' });
    }
    const slotToUpdate = await prisma.timetableSlot.findUnique({ where: { id: timetableSlotId } });
    if (!slotToUpdate) {
      return res.status(404).json({ message: 'Timetable slot not found.' });
    }

    const updatedSlot = await prisma.timetableSlot.update({
      where: { id: timetableSlotId },
      data: { substituteTeacherId: null },
      include: { teacher: true, substituteTeacher: true }
    });
    return res.status(200).json({ message: 'Substitute teacher cleared successfully.', slot: updatedSlot });

  } catch (error) {
    next(error);
  }
};