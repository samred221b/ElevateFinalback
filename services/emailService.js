const nodemailer = require('nodemailer');

// Create email transporter
const createTransporter = () => {
  // For development, use a simple SMTP service like Gmail
  // For production, use services like SendGrid, AWS SES, etc.
  
  if (process.env.NODE_ENV === 'production') {
    // Production email service (you can configure this later)
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } else {
    // Development - use console logging (no real email sent)
    console.log('📧 Development mode: Email will be logged to console');
    return nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true
    });
  }
};

// Send verification email
const sendVerificationEmail = async (email, name, verificationCode) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@elevate-app.com',
      to: email,
      subject: 'Verify Your Email - Elevate Habit Tracker',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .verification-code { background: #667eea; color: white; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 Welcome to Elevate!</h1>
              <p>Verify your email to start building better habits</p>
            </div>
            <div class="content">
              <h2>Hi ${name}!</h2>
              <p>Thank you for signing up for Elevate Habit Tracker. To complete your registration and start building amazing habits, please verify your email address.</p>
              
              <p><strong>Your verification code is:</strong></p>
              <div class="verification-code">${verificationCode}</div>
              
              <p>This code will expire in <strong>15 minutes</strong>. If you didn't create an account with Elevate, please ignore this email.</p>
              
              <p>Once verified, you'll be able to:</p>
              <ul>
                <li>✅ Create and track your habits</li>
                <li>📊 View detailed analytics</li>
                <li>🏆 Earn achievements and badges</li>
                <li>📱 Get helpful reminders</li>
              </ul>
              
              <p>Welcome to your journey of personal growth!</p>
              <p><strong>The Elevate Team</strong></p>
            </div>
            <div class="footer">
              <p>This email was sent to ${email}. If you didn't sign up for Elevate, please ignore this email.</p>
              <p>&copy; 2024 Elevate Habit Tracker. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to Elevate Habit Tracker!
        
        Hi ${name},
        
        Thank you for signing up! To complete your registration, please verify your email address.
        
        Your verification code is: ${verificationCode}
        
        This code will expire in 15 minutes.
        
        Welcome to your journey of personal growth!
        
        The Elevate Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Verification email sent:', info.messageId);
    
    // In development, log the verification code to console
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔐 DEVELOPMENT MODE - Verification Code for', email, ':', verificationCode);
      console.log('📧 Email content logged above (no real email sent in development)');
    }
    
    return {
      success: true,
      messageId: info.messageId,
      previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(info) : null
    };
    
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Send welcome email after verification
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@elevate-app.com',
      to: email,
      subject: '🎉 Welcome to Elevate - Let\'s Build Great Habits!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Elevate</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Elevate!</h1>
              <p>Your journey to better habits starts now</p>
            </div>
            <div class="content">
              <h2>Hi ${name}!</h2>
              <p>Congratulations! Your email has been verified and your Elevate account is now active.</p>
              
              <p>Here's what you can do now:</p>
              
              <div class="feature">
                <h3>🎯 Create Your First Habit</h3>
                <p>Start with something small and build momentum. Whether it's drinking more water, reading daily, or exercising - every journey begins with a single step.</p>
              </div>
              
              <div class="feature">
                <h3>📊 Track Your Progress</h3>
                <p>Watch your streaks grow and see detailed analytics of your habit-building journey.</p>
              </div>
              
              <div class="feature">
                <h3>🏆 Earn Achievements</h3>
                <p>Unlock badges and celebrate milestones as you build consistency.</p>
              </div>
              
              <div class="feature">
                <h3>📱 Get Reminders</h3>
                <p>Set up notifications to help you stay on track with your habits.</p>
              </div>
              
              <p>Ready to elevate your life? Log in and create your first habit!</p>
              
              <p>Happy habit building!</p>
              <p><strong>The Elevate Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Elevate Habit Tracker. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, name, resetCode) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@elevate-app.com',
      to: email,
      subject: 'Reset Your Password - Elevate Habit Tracker',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .reset-code { background: #dc2626; color: white; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .warning { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 15px; border-radius: 8px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
              <p>Reset your Elevate account password</p>
            </div>
            <div class="content">
              <h2>Hi ${name}!</h2>
              <p>We received a request to reset your password for your Elevate Habit Tracker account.</p>
              
              <p><strong>Your password reset code is:</strong></p>
              <div class="reset-code">${resetCode}</div>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul>
                  <li>This code will expire in <strong>15 minutes</strong></li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Never share this code with anyone</li>
                </ul>
              </div>
              
              <p>Enter this code in the password reset form to create a new password.</p>
              
              <p>Stay secure!</p>
              <p><strong>The Elevate Team</strong></p>
            </div>
            <div class="footer">
              <p>This email was sent to ${email}. If you didn't request a password reset, please ignore this email.</p>
              <p>&copy; 2024 Elevate Habit Tracker. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request - Elevate Habit Tracker
        
        Hi ${name},
        
        We received a request to reset your password for your Elevate account.
        
        Your password reset code is: ${resetCode}
        
        This code will expire in 15 minutes.
        
        If you didn't request this reset, please ignore this email.
        
        The Elevate Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Password reset email sent:', info.messageId);
    
    // In development, log the reset code to console
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔐 DEVELOPMENT MODE - Password Reset Code for', email, ':', resetCode);
      console.log('📧 Password reset email content logged above (no real email sent in development)');
    }
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail
};
