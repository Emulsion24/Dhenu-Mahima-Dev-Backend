import { prisma } from "../prisma/config.js";

// Get Terms & Conditions
export const getPolicy = async (req, res) => {
  try {
    const policy = await prisma.termsConditions.findFirst({
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

// Create or Update Terms & Conditions (Delete All Previous & Create Fresh)
export const savePolicy = async (req, res) => {
  try {
    const { title, subtitle, lastUpdated, contact, sections } = req.body;

    // 🗑️ Delete all existing policies, sections, and contacts
    await prisma.termsConditionsSection.deleteMany({});
    await prisma.termsConditions.deleteMany({});
    await prisma.termsConditionsContact.deleteMany({});

    // 🆕 Create fresh contact
    const newContact = await prisma.termsConditionsContact.create({ 
      data: {
        email: contact.email || '',
        phone: contact.phone || '',
        phoneHours: contact.phoneHours || '',
        address: contact.address || '',
      }
    });

    // 🆕 Create fresh Terms & Conditions with sections
    const newPolicy = await prisma.termsConditions.create({
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

    console.log("Terms & Conditions saved successfully:", newPolicy);
    res.status(200).json(newPolicy);

  } catch (error) {
    console.error("Save Terms & Conditions Error:", error);
    res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};
