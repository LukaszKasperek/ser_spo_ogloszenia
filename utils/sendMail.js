// sendMail.js
const nodemailer = require('nodemailer');
const dotenv = require('dotenv').config({ path: './config.env' });

// const fs = require('fs').promises;
// const path = require('path');

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

async function sendEmail(sender, message, files) {
  let mailOptions = {
    from: process.env.EMAIL,
    to: process.env.EMAIL,
    subject: `Nowa wiadomość APP`,
    html: `<h1>${sender}:</h1><p>${message}</p>`,
    attachments: files.map((file, index) => ({
      filename: file.originalname,
      path: file.path,
      cid: `file${index}`,
    })),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent');

    // teraz możemy usunąć pliki z folderu uploads
    /**  const directory = './uploads';

    const filesToDelete = await fs.readdir(directory);

    for (const file of filesToDelete) {
      try {
        await fs.unlink(path.join(directory, file));
      } catch (err) {
        console.error(err);
      }
    }*/
  } catch (error) {
    console.log(error);
  }

  // transporter.sendMail(mailOptions, function (error, info) {
  //   if (error) {
  //     console.log(error);
  //   } else {
  //     console.log('Email sent: ' + info.response);
  //   }
  // });
}

module.exports = sendEmail;
