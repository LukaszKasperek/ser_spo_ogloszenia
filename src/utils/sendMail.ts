import nodemailer from 'nodemailer';
import { safeFilename } from './fileHelpers';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendEmail(
  sender: string,
  message: string,
  files: Express.Multer.File[],
): Promise<void> {
  const mailOptions = {
    from: process.env.EMAIL,
    to: process.env.EMAIL,
    subject: 'Nowa wiadomość APP',
    html: `<h1>${escapeHtml(sender)}:</h1><p>${escapeHtml(message)}</p>`,
    attachments: files.map((file) => ({
      filename: safeFilename(file.originalname),
      path: file.path,
      contentType: file.mimetype,
    })),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent');
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
}
