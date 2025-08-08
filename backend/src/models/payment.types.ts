// src/models/payment.types.ts
import { PaymentMode } from '@prisma/client';

export interface FeePaymentCreateInput {
  studentFeeId: string; // ID of the StudentFee record this payment is for
  paidAmount: number;
  paymentDate: string; // YYYY-MM-DD
  mode: PaymentMode;
  notes?: string;
  // receiptNumber is auto-generated
  // createdById is from logged-in user
}