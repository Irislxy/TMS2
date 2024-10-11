const nodemailer = require("nodemailer")

// Create a transporter object using your email service
const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io", // Replace with your SMTP server
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: "dbe68c974f7808", // tms email
    pass: "cc18a87b3e3225" // tms password
  }
})

// Function to send email
const sendEmail = (to, subject, text) => {
  const mailOptions = {
    from: '"TMS" <no-reply@tms.com>',
    to: to,
    subject: subject,
    text: text
  }

  return transporter.sendMail(mailOptions)
}

module.exports = { sendEmail }
