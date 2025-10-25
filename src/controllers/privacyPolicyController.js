import { prisma } from "../prisma/config.js";

// Get Privacy Policy
export const getPolicy = async (req, res) => {
  try {
    const policy = await prisma.privacyPolicy.findFirst({
      include: {
        sections: { orderBy: { order: 'asc' } },
        contact: true,
      },
    });
    res.json(policy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create or Update Privacy Policy (Delete All Previous & Create Fresh)
export const savePolicy = async (req, res) => {
  try {
    const { title, subtitle, lastUpdated, contact, sections } = req.body;
    console.log("Received Policy Data:", req.body);

    // 🗑️ Delete all existing privacy policies, sections, and contacts
    await prisma.section.deleteMany({});
    await prisma.privacyPolicy.deleteMany({});
    await prisma.contact.deleteMany({});

    // 🆕 Create fresh contact
    const newContact = await prisma.contact.create({ 
      data: {
        email: contact.email || '',
        phone: contact.phone || '',
        phoneHours: contact.phoneHours || '',
        address: contact.address || '',
      }
    });

    // 🆕 Create fresh privacy policy with sections
    const newPolicy = await prisma.privacyPolicy.create({
      data: {
        title: title || '',
        subtitle: subtitle || '',
        lastUpdated: lastUpdated ? new Date(lastUpdated) : new Date(),
        contactId: newContact.id,
        sections: {
          create: (sections || []).map(section => ({
            title: section.title,
            content: section.content,
            order: section.order ?? 0,
          })),
        },
      },
      include: { 
        contact: true, 
        sections: { orderBy: { order: 'asc' } } 
      },
    });

    console.log("Policy saved successfully:", newPolicy);
    res.status(200).json(newPolicy);

  } catch (error) {
    console.error("Save Policy Error:", error);
    res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};