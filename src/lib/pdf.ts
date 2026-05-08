import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { Student, DailyReport } from '../firebase';

export const generateStudentReportPDF = async (student: Student, reports: DailyReport[]) => {
  const doc = new jsPDF();

  // Helper to load image as Base64
  const getBase64Image = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute('crossOrigin', 'anonymous');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  // Branding
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Madrasa Islami Mohammadi', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Dheri Hassan Abad, Qazi Road, Rawalpindi', 105, 26, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Education Progress Report', 105, 34, { align: 'center' });

  // Student Info Section
  let currentY = 50;
  
  if (student.imageUrl) {
    try {
      const base64 = await getBase64Image(student.imageUrl);
      doc.addImage(base64, 'PNG', 160, 45, 35, 35);
    } catch (e) {
      console.error('Could not load student image', e);
    }
  }

  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-400
  doc.text('STUDENT INFORMATION', 15, currentY);
  currentY += 8;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  
  const leftColX = 15;
  const midColX = 90;
  
  doc.text(`Student Name:`, leftColX, currentY);
  doc.setFont(undefined, 'bold');
  doc.text(`${student.name.toUpperCase()}`, leftColX + 30, currentY);
  doc.setFont(undefined, 'normal');

  doc.text(`Current Class:`, midColX, currentY);
  doc.setFont(undefined, 'bold');
  doc.text(`${student.currentClass}`, midColX + 30, currentY);
  doc.setFont(undefined, 'normal');
  
  currentY += 8;
  
  doc.text(`Father Name:`, leftColX, currentY);
  doc.text(`${student.fatherName}`, leftColX + 30, currentY);

  doc.text(`Registration ID:`, midColX, currentY);
  doc.text(`${student.registrationNumber}`, midColX + 30, currentY);
  
  currentY += 8;
  
  doc.text(`Admission Date:`, leftColX, currentY);
  doc.text(`${student.admissionDate || 'N/A'}`, leftColX + 30, currentY);

  doc.text(`Status:`, midColX, currentY);
  doc.setTextColor(16, 185, 129);
  doc.text(`${student.status.toUpperCase()}`, midColX + 30, currentY);
  doc.setTextColor(30, 41, 59);

  currentY += 8;

  const lastReport = reports.length > 0 ? reports[0] : null;
  const lastLesson = student.lastLesson || (lastReport ? lastReport.lesson : 'Not Started');
  
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(15, currentY - 4, 130, 10, 'F');
  doc.setTextColor(16, 185, 129);
  doc.setFont(undefined, 'bold');
  doc.text(`LAST LESSON: ${lastLesson}`, 20, currentY + 2);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(30, 41, 59);

  // Footer line
  doc.setDrawColor(16, 185, 129, 0.2);
  doc.line(15, 88, 195, 88);

  // Table
  const tableRows = reports.map(r => [
    format(new Date(r.date), 'dd-MMM-yyyy'),
    r.attendance.toUpperCase(),
    r.type.toUpperCase(),
    r.lesson,
    r.mistakes || 'None',
    r.notes || ''
  ]);

  (doc as any).autoTable({
    startY: 95,
    head: [['Date', 'Attendance', 'Type', 'Lesson / Manzil', 'Mistakes', 'Remarks']],
    body: tableRows,
    headStyles: { fillColor: [16, 185, 129], fontSize: 10, halign: 'center' }, // emerald-500
    alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
    margin: { left: 15, right: 15 },
    styles: { fontSize: 9, cellPadding: 4, font: 'helvetica', valign: 'middle' },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      4: { halign: 'center' }
    }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount} - Madrasa Islami Mohammadi Internal Record`,
      105,
      285,
      { align: 'center' }
    );
  }

  doc.save(`${student.name.replace(/\s+/g, '_')}_Report.pdf`);
};
