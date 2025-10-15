

import {prisma} from '../prisma/config.js';





// ✅ Helper: check if event date has passed
const isEventExpired = (eventDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(eventDate);
  endDate.setHours(23, 59, 59, 999);
  return endDate < today;
};

// ✅ Auto-delete expired events
const deleteExpiredEvents = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
console.log("Prisma client:", prisma?.event);

    const result = await prisma.event.deleteMany({
      where: {
        endDate: { lt: today },
      },
    });

    console.log(`Deleted ${result.count} expired events`);
    return result.count;
  } catch (error) {
    console.error("Error deleting expired events:", error);
    throw error;
  }
};

// ✅ Get all events (and cleanup expired ones first)
export const getAllEvents = async (req, res) => {
  try {
    await deleteExpiredEvents();

    const events = await prisma.event.findMany({
      orderBy: { startDate: "asc" },
    });

    res.status(200).json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch events",
      error: error.message,
    });
  }
};

// ✅ Get single event by ID
export const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);

    if (isNaN(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (isEventExpired(event.endDate)) {
      await prisma.event.delete({ where: { id: eventId } });
      return res.status(404).json({
        success: false,
        message: "Event has expired and been removed",
      });
    }

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event",
      error: error.message,
    });
  }
};

// ✅ Create new event
export const createEvent = async (req, res) => {
  try {
    const {
      title,
      startDate,
      endDate,
      time,
      location,
      duration,
      color,
      liveLinks,
      description,
    } = req.body;

    if (!title || !startDate || !endDate || !location || !duration) {
      return res.status(400).json({
        success: false,
        message:
          "Title, start date, end date, location, and duration are required fields",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    if (isEventExpired(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Cannot create an event with a past end date",
      });
    }

    const event = await prisma.event.create({
      data: {
        title,
        startDate: start,
        endDate: end,
        time: time || null,
        location,
        duration,
        color: color || "from-orange-500 to-red-500",
        liveLinks: liveLinks || [],
        description: description || null,
      },
    });

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create event",
      error: error.message,
    });
  }
};

// ✅ Update event
export const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);

    if (isNaN(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const {
      title,
      startDate,
      endDate,
      time,
      location,
      duration,
      color,
      liveLinks,
      description,
    } = req.body;

    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be after end date",
        });
      }
    }

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(title && { title }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(time !== undefined && { time }),
        ...(location && { location }),
        ...(duration && { duration }),
        ...(color && { color }),
        ...(liveLinks && { liveLinks }),
        ...(description !== undefined && { description }),
      },
    });

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: updatedEvent,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update event",
      error: error.message,
    });
  }
};

// ✅ Delete event
export const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);

    if (isNaN(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    await prisma.event.delete({
      where: { id: eventId },
    });

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete event",
      error: error.message,
    });
  }
};

// ✅ Manual cleanup route
export const cleanupExpiredEvents = async (req, res) => {
  try {
    const count = await deleteExpiredEvents();

    res.status(200).json({
      success: true,
      message: `Cleanup completed. ${count} expired events removed.`,
      deletedCount: count,
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup expired events",
      error: error.message,
    });
  }
};
