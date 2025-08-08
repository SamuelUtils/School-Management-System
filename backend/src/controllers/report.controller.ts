// src/controllers/report.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client'; // For types if needed

// --- Fee Summary Report ---
interface MonthlyFeeSummary {
    year: number;
    month: number; // 1-12
    feeCategoryId: string;
    feeCategoryName: string;
    totalAssignedForMonth: number; // Sum of assigned amounts for fees whose *assignment* could be tied to this month (more complex) OR total base for active students.
    // For simplicity, let's consider total base amount of the category multiplied by active assignments.
    // A better approach: sum of StudentFee.assignedAmount for active students.
    totalCollectedInMonth: number; // Sum of payments made *in* this month for this category
    totalOverallDueForCategory: number; // Overall outstanding for this category across all time
    totalDiscountGivenForCategory: number; // Overall discount for this category
}


export const getFeeSummaryReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // For this report, we'll provide a snapshot.
        // A true "monthly" collected/due requires more complex date filtering on payments and assignments.
        // Let's simplify: overall summary grouped by category, and then total collected THIS month.

        const feeCategories = await prisma.feeCategory.findMany({
            include: {
                studentFees: { // All student fees ever assigned to this category
                    include: {
                        payments: true, // All payments made for each student fee
                    }
                }
            }
        });

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11

        const report = feeCategories.map(category => {
            let totalAssignedForCategory = 0;
            let totalDiscountForCategory = 0;
            let totalPaidForCategoryAllTime = 0;
            let totalCollectedThisMonthForCategory = 0;

            category.studentFees.forEach(sf => {
                totalAssignedForCategory += sf.assignedAmount; // This is the net amount after discount for the student
                totalDiscountForCategory += sf.discountAmount;

                sf.payments.forEach(payment => {
                    totalPaidForCategoryAllTime += payment.paidAmount;
                    const paymentDate = new Date(payment.paymentDate);
                    if (paymentDate.getFullYear() === currentYear && paymentDate.getMonth() === currentMonth) {
                        totalCollectedThisMonthForCategory += payment.paidAmount;
                    }
                });
            });

            return {
                feeCategoryId: category.id,
                feeCategoryName: category.name,
                baseAmount: category.baseAmount, // Base amount of the category itself
                totalNetAssignedAllTime: totalAssignedForCategory, // Sum of all (base - discount) for this category
                totalDiscountGivenAllTime: totalDiscountForCategory,
                totalPaidAllTime: totalPaidForCategoryAllTime,
                totalOverallDueForCategory: totalAssignedForCategory - totalPaidForCategoryAllTime,
                totalCollectedThisMonth: totalCollectedThisMonthForCategory,
                numberOfAssignments: category.studentFees.length,
            };
        });

        // Calculate overall totals
        const overallTotals = report.reduce((acc, curr) => {
            acc.totalNetAssignedAllTime += curr.totalNetAssignedAllTime;
            acc.totalDiscountGivenAllTime += curr.totalDiscountGivenAllTime;
            acc.totalPaidAllTime += curr.totalPaidAllTime;
            acc.totalOverallDueForCategory += curr.totalOverallDueForCategory;
            acc.totalCollectedThisMonth += curr.totalCollectedThisMonth;
            return acc;
        }, {
            totalNetAssignedAllTime: 0,
            totalDiscountGivenAllTime: 0,
            totalPaidAllTime: 0,
            totalOverallDueForCategory: 0,
            totalCollectedThisMonth: 0,
        });


        return res.status(200).json({ summaryByCategory: report, overallTotals });
    } catch (error) {
        next(error);
    }
};


// --- Per-Student Fee Report ---
export const getStudentFeeReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: studentId } = req.params;

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, name: true, currentClass: true } // Select only needed student fields
        });

        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        const studentFees = await prisma.studentFee.findMany({
            where: { studentId: studentId },
            include: {
                feeCategory: { select: { id: true, name: true, baseAmount: true } },
                payments: { // All payments for this specific studentFee entry
                    orderBy: { paymentDate: 'asc' },
                    select: { id: true, paidAmount: true, paymentDate: true, mode: true, receiptNumber: true, notes: true }
                }
            }
        });

        if (studentFees.length === 0) {
            return res.status(200).json({
                student,
                message: 'No fees assigned to this student yet.',
                feeDetails: [],
                summary: { totalAssigned: 0, totalDiscount: 0, totalPayable: 0, totalPaid: 0, totalDue: 0 }
            });
        }

        let overallTotalAssigned = 0; // Sum of FeeCategory.baseAmount for assigned fees
        let overallTotalDiscount = 0;
        let overallTotalPayable = 0; // Sum of StudentFee.assignedAmount
        let overallTotalPaid = 0;
        let overallTotalDue = 0;

        const feeDetails = studentFees.map(sf => {
            const totalPaidForThisFee = sf.payments.reduce((sum, p) => sum + p.paidAmount, 0);
            // StudentFee.assignedAmount already considers discount (baseAmount - discountAmount)
            const amountDueForThisFee = sf.assignedAmount - totalPaidForThisFee;

            overallTotalAssigned += sf.feeCategory.baseAmount; // original base amount
            overallTotalDiscount += sf.discountAmount;
            overallTotalPayable += sf.assignedAmount; // net payable for this student for this fee
            overallTotalPaid += totalPaidForThisFee;
            overallTotalDue += amountDueForThisFee;

            return {
                feeCategoryId: sf.feeCategoryId,
                feeCategoryName: sf.feeCategory.name,
                feeCategoryBaseAmount: sf.feeCategory.baseAmount, // Original base for the category
                assignedAmountForStudent: sf.assignedAmount, // The net amount after student-specific discount
                discountGivenToStudent: sf.discountAmount,
                totalPaidByStudent: totalPaidForThisFee,
                amountDueByStudent: amountDueForThisFee,
                payments: sf.payments.map(p => ({
                    ...p,
                    paymentDate: new Date(p.paymentDate).toISOString().split('T')[0] // Format date
                })),
            };
        });

        return res.status(200).json({
            student,
            feeDetails,
            summary: {
                overallTotalAssigned, // Sum of all original base amounts of categories assigned
                overallTotalDiscount, // Sum of all discounts given to this student
                overallTotalPayable,  // Sum of all net payable amounts for this student
                overallTotalPaid,
                overallTotalDue
            }
        });

    } catch (error) {
        next(error);
    }
};


// --- Stubbed Export Feature ---
export const exportFeeReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // In a real app, you'd generate data similar to getFeeSummaryReport or getStudentFeeReport
        // Then use a library like 'exceljs' for Excel or 'pdfmake' for PDF.
        // For this stub, we'll simulate returning a file.

        const { type = 'csv', studentId } = req.query; // e.g., /api/admin/reports/export?type=csv&studentId=xxx

        console.log(`[Stub Export] Request to export ${type} report. Student ID: ${studentId || 'Overall Summary'}`);

        if (type === 'csv') {
            // Simulate CSV data
            let csvData = "FeeCategory,TotalAssigned,TotalCollected,TotalDue\n";
            csvData += "Tuition,5000,4000,1000\n";
            csvData += "Transport,1000,800,200\n";

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="fee_report_${studentId || 'summary'}_${Date.now()}.csv"`);
            return res.status(200).send(csvData);
        } else if (type === 'pdf') {
            // Simulate PDF - in reality, this would be a binary stream
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="fee_report_${studentId || 'summary'}_${Date.now()}.pdf"`);
            return res.send("This would be PDF binary data.");
            //return res.status(200).send("This would be PDF binary data.");
        } else {
            return res.status(400).json({ message: "Unsupported export type. Use 'csv' or 'pdf'." });
        }
    } catch (error) {
        next(error);
    }
};