// src/models/fee.types.ts

export interface FeeCategoryCreateInput {
    name: string;
    description?: string;
    baseAmount: number; // Expect number from request, will be Float in DB
  }
  
  export interface StudentFeeAssignInput {
    studentId: string;
    feeCategoryId: string;
    discountAmount?: number; // Optional, defaults to 0
    // assignedAmount is calculated, not taken as direct input
  }