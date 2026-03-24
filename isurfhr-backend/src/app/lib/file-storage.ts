// src/app/lib/file-storage.ts
import { prisma } from '@/app/lib/db'

export class FileStorage {
  static async storePayslip(
    fileBuffer: Buffer,
    fileName: string,
    metadata: {
      payrollId: string;
      staffRecordId: string;
      companyId: string;
      month: string;
      year: number;
      grossPay?: number;
      netPay?: number;
      createdBy?: string;
    }
  ) {
    // Convert Buffer to Uint8Array for Prisma compatibility
    const uint8Array = new Uint8Array(fileBuffer)
    
    const payslip = await prisma.payslip.create({
      data: {
        payrollId: metadata.payrollId,
        staffRecordId: metadata.staffRecordId,
        companyId: metadata.companyId,
        fileName: fileName,
        fileData: uint8Array, // Use Uint8Array instead of Buffer
        fileType: 'application/pdf',
        fileSize: fileBuffer.length,
        month: metadata.month,
        year: metadata.year,
        grossPay: metadata.grossPay,
        netPay: metadata.netPay,
        createdBy: metadata.createdBy,
        // Optionally keep filePath for reference
        filePath: `/database/payslips/${metadata.staffRecordId}/${metadata.year}/${metadata.month}/${fileName}`,
      }
    });

    return payslip;
  }

  static async getPayslipFile(payslipId: string) {
    const payslip = await prisma.payslip.findUnique({
      where: { id: payslipId },
      select: {
        fileData: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        companyId: true,
        staffRecordId: true,
      }
    });

    if (!payslip?.fileData) {
      throw new Error('Payslip file not found');
    }

    // Convert Uint8Array back to Buffer if needed
    const buffer = Buffer.from(payslip.fileData)

    return {
      buffer: buffer,
      fileName: payslip.fileName,
      contentType: payslip.fileType || 'application/pdf',
      size: payslip.fileSize,
    };
  }

  static async deletePayslip(payslipId: string) {
    return await prisma.payslip.delete({
      where: { id: payslipId }
    });
  }

  static async updatePayslipFile(
    payslipId: string,
    fileBuffer: Buffer,
    fileName: string,
    updatedBy?: string
  ) {
    // Convert Buffer to Uint8Array for Prisma compatibility
    const uint8Array = new Uint8Array(fileBuffer)
    
    return await prisma.payslip.update({
      where: { id: payslipId },
      data: {
        fileName: fileName,
        fileData: uint8Array, // Use Uint8Array instead of Buffer
        fileType: 'application/pdf',
        fileSize: fileBuffer.length,
        updatedBy: updatedBy,
        updatedAt: new Date(),
      }
    });
  }
}