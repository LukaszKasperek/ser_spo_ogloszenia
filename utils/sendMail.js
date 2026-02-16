const nodemailer = require('nodemailer');
const dotenv = require('dotenv').config({ path: './config.env', quiet: true });

let transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

async function sendEmail(sender, message, files) {
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

module.exports = sendEmail;
