import nodemailer from 'nodemailer';

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

// Verify transporter on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter verification failed:', error.message);
  } else {
    console.log('✅ Gau Katha booking email server is ready');
  }
});

export const submitGauKathaBooking = async (req, res) => {
  try {
    const { name, contact, state, city,email } = req.body;

    // Validate required fields
    if (!name || !contact || !state || !city||!email) {
      return res.status(400).json({ 
        error: 'सभी फ़ील्ड आवश्यक हैं / All fields are required',
        success: false 
      });
    }

    // Validate contact number (Indian format)
    const contactRegex = /^[6-9]\d{9}$/;
    if (!contactRegex.test(contact.replace(/\s/g, ''))) {
      return res.status(400).json({ 
        error: 'कृपया सही मोबाइल नंबर दर्ज करें / Please enter a valid 10-digit mobile number',
        success: false 
      });
    }




    // Email to admin
    const adminMailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: `🙏 नया गौ कथा बुकिंग - ${name} से ${city}, ${state}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2>🐄 Gau Katha Booking Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Contact:</strong> <a href="tel:+91${contact}">+91 ${contact}</a></p>
          <p><strong>State:</strong> ${state}</p>
          <p><strong>City/Village:</strong> ${city}</p>
          <p><strong>Submitted at:</strong> ${new Date().toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long' })}</p>

          <p>Please contact the applicant to schedule the Gau Katha.</p>
        </div>
      `,
      text: `
🐄 Gau Katha Booking Request

Name: ${name}
Contact: +91 ${contact}
State: ${state}
City/Village: ${city}
Email:${email}


Please contact the applicant to schedule the Gau Katha.
      `,
    };
   const userMailOptions = {
  from: process.env.EMAIL_FROM,
  to: email,
  subject: `🙏 धन्यवाद ${name} जी - आपकी गौ कथा बुकिंग सफल रही!`,
  html: `
    <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px; border-radius: 8px;">
      <h2 style="color: #4a7729;">🐄 जय गोमाता! आपकी गौ कथा बुकिंग सफल रही</h2>
      <p>प्रिय <strong>${name}</strong> जी,</p>

      <p>हमने आपकी <strong>गौ कथा बुकिंग</strong> का अनुरोध प्राप्त कर लिया है। हमारी टीम शीघ्र ही आपसे संपर्क करेगी और आगे की प्रक्रिया की जानकारी देगी।</p>

      <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;" />

      <h3>📋 बुकिंग विवरण:</h3>
      <p><strong>नाम:</strong> ${name}</p>
      <p><strong>संपर्क:</strong> <a href="tel:+91${contact}" style="color: #4a7729;">+91 ${contact}</a></p>
      <p><strong>राज्य:</strong> ${state}</p>
      <p><strong>शहर / गांव:</strong> ${city}</p>
      <p><strong>बुकिंग समय:</strong> ${new Date().toLocaleString('hi-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'long',
      })}</p>

      <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="font-size: 15px;">
        🙏 गोसेवा से बढ़कर कोई सेवा नहीं।<br/>
        हमारी टीम जल्द ही आपके द्वारा दिए गए नंबर पर संपर्क करेगी।
      </p>

      <p style="margin-top: 20px; color: #4a7729;">
        सादर,<br/>
        <strong>धेनु महिमा सेवा टीम</strong>
      </p>
    </div>
  `,
  text: `
🐄 जय गोमाता! आपकी गौ कथा बुकिंग सफल रही

प्रिय ${name} जी,

हमने आपकी गौ कथा बुकिंग का अनुरोध प्राप्त कर लिया है।
हमारी टीम शीघ्र ही आपसे संपर्क करेगी।

📋 बुकिंग विवरण:
नाम: ${name}
संपर्क: +91 ${contact}
राज्य: ${state}
शहर / गांव: ${city}
बुकिंग समय: ${new Date().toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long' })}

🙏 गोसेवा से बढ़कर कोई सेवा नहीं।
सादर,
धेनु महिमा सेवा टीम
  `,
};



    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(userMailOptions);
    console.log('✅ Admin email sent successfully');

    res.status(200).json({ 
      message: 'आपका आवेदन सफलतापूर्वक जमा हो गया है! / Your booking request has been submitted successfully!',
      success: true,

    });

  } catch (error) {
    console.error('❌ Error submitting Gau Katha booking:', error);

    let errorMessage = 'आवेदन जमा करने में त्रुटि / Failed to submit booking request';

    if (error.code === 'EAUTH') {
      errorMessage = 'ईमेल भेजने में त्रुटि / Email sending failed';
    }

    res.status(500).json({ 
      error: errorMessage,
      success: false,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
