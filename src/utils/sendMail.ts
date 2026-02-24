import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

export async function sendEmail(
  sender: string,
  message: string,
  files: Express.Multer.File[],
): Promise<void> {
  const mailOptions = {
    from: process.env.EMAIL,
    to: process.env.EMAIL,
    subject: 'Nowa wiadomość APP',
    html: `<h1>${sender}:</h1><p>${message}</p>`,
    attachments: files.map((file) => ({
      filename: file.originalname,
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
