// userController.js
import {prisma} from "../prisma/config.js"; // Adjust path as needed
import bcrypt from "bcrypt";

// Get all users with pagination and search
// Get all users with pagination and search
export async function getUsers(req, res) {
  try {
    const { page = 1, limit = 6, search = "", role = "" } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build filter conditions
    const where = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: undefined } }, // removed mode
        { email: { contains: search, mode: undefined } }, // removed mode
        { phone: { contains: search } },
      ];
    }

    if (role) {
      where.role = role;
    }

    // Get total count for pagination
    const totalUsers = await prisma.user.count({ where });

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get role counts
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    const subadminCount = await prisma.user.count({ where: { role: "subadmin" } });
    const userCount = await prisma.user.count({ where: { role: "user" } });

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / take),
        totalUsers,
        perPage: take,
        hasNextPage: skip + take < totalUsers,
        hasPrevPage: parseInt(page) > 1,
      },
      stats: {
        total: totalUsers,
        admins: adminCount,
        subadmins: subadminCount,
        users: userCount,
      },
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: err.message,
    });
  }
}


// Get single user by ID
export async function getUserById(req, res) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: err.message,
    });
  }
}

// Add new user
export async function addUser(req, res) {
  try {
      const raw = req.body.body ? JSON.parse(req.body.body) : req.body;
    const { name, email, phone, role = "user", password } = raw

    // Validation
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and phone are required",
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Hash password if provided, otherwise use default
    const defaultPassword = "password123";
    const hashedPassword = await bcrypt.hash(password || defaultPassword, 10);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        role: role.toLowerCase(),
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        isVerified:true,
      },
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: newUser,
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: err.message,
    });
  }
}

// Update user

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
      const raw = req.body.body ? JSON.parse(req.body.body) : req.body;
    const { name, email, phone, role, password } = raw;

    console.log("🟢 Incoming update request for user ID:", id);
    console.log("📦 Request body:", req.body);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Missing user ID in request params",
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if email is changing and already exists
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    // Build update data only from provided fields
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role.toLowerCase();
    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    console.log("🛠 Update data:", updateData);

    // Prevent empty update calls
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        updatedAt: true,
      },
    });

    console.log("✅ Updated user:", updatedUser);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (err) {
    console.error("❌ Error updating user:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: err.message,
    });
  }
}


// Delete user
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent deleting yourself (optional safety check)
    if (req.user && req.user.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account",
      });
    }

    // Delete user
    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: err.message,
    });
  }
}

// Update user role (admin only)
export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;
    

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    const validRoles = ["admin", "subadmin", "user"];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be admin, subadmin, or user",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { role: role.toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: updatedUser,
    });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
      error: err.message,
    });
  }
}