// src/lib/utils.ts (or a more specific file like receipt.utils.ts)
import prisma from './prisma'; // If needed to check for uniqueness, though DB constraint is better

// Simple counter for receipt numbers for the current year - for demo purposes.
// In production, you'd want a more robust, potentially DB-backed sequence or a more complex algorithm.
let receiptCounter = 0; // This will reset on server restart - NOT PRODUCTION READY

export const generateReceiptNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  // This is a very basic approach. Production systems need robust, atomic counters.
  // For demonstration, we'll try to get the last one and increment.
  // This has race conditions if not handled in a transaction with DB sequence.

  // A slightly better approach for demo (still not perfect for high concurrency):
  const lastPayment = await prisma.feePayment.findFirst({
    orderBy: { createdAt: 'desc' }, // Assuming createdAt gives some order
    select: { receiptNumber: true }
  });

  let nextNumericPart = 1;
  if (lastPayment && lastPayment.receiptNumber) {
    const parts = lastPayment.receiptNumber.split('-');
    if (parts.length === 3 && parts[1] === String(year)) {
      const lastNum = parseInt(parts[2], 10);
      if (!isNaN(lastNum)) {
        nextNumericPart = lastNum + 1;
      }
    }
  }
  // Reset counter if year changes (very basic)
  // This should ideally check the year of the last receipt.

  const numericPartPadded = String(nextNumericPart).padStart(4, '0');
  return `FEERCT-${year}-${numericPartPadded}`;
  // IMPORTANT: The @unique constraint on receiptNumber in Prisma schema is the ultimate guard.
  // If this function generates a duplicate, Prisma will throw an error on create,
  // and you'd need to retry with a new number (e.g., in a loop with a limit).
};