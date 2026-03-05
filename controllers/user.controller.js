const UserModel = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mailSender = require("../middleware/mail");
const PostModel = require ("../models/post.model");
const OTPModel = require("../models/otp.model");
const otpgen = require("otp-generator");

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NODE_MAIL,
    pass: process.env.NODE_PASS
  }
});


const createUser = async (req, res) => {
  const { lastName, firstName, email, password } = req.body;
  try {
    const saltround = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, saltround);

    const user = await UserModel.create({
      firstName, lastName, email, password: hashedPassword,
    });

    const token = await jwt.sign(
      { id: user._id, roles: user.roles },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    // ✅ Send email BEFORE res.send()
    try {
      const renderMail = await mailSender("welcomeMail.ejs", { firstName });
      const mailOptions = {
        from: process.env.NODE_MAIL,
        to: email,
        subject: `Welcome, ${firstName}`,
        html: renderMail
      };
      await transporter.sendMail(mailOptions);
      console.log("Welcome email sent");
    } catch (emailError) {
      console.log("WELCOME EMAIL FAILED:", emailError.message);
    }

    // ✅ res.send() comes LAST
    res.status(201).send({
      message: "User created successfully",
      data: { lastName, firstName, email, roles: user.roles },
      token,
    });

  } catch (error) {
    console.log(error);
    if (error.code == 11000) {
      return res.status(400).send({ message: "User already exist" });
    }
    res.status(400).send({ message: "User creation failed" });
  }
};
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const isUser = await UserModel.findOne({ email }).select("+password");
    if (!isUser) {
      res.status(404).send({
        message: "Invalid credentials",
      });

      return;
    }

    const isMatch = await bcrypt.compare(password, isUser.password);
    if (!isMatch) {
      res.status(404).send({
        message: "Invalid credentials",
      });

      return;
    }

    const token = await jwt.sign(
      { id: isUser._id, roles: isUser.roles },
      process.env.JWT_SECRET,
      { expiresIn: "5h" },
    );
    res.status(200).send({
      message: "User logged in successfully",
      data: {
        id:isUser._id,
        email: isUser.email,
        roles: isUser.roles,
        firstName: isUser.firstName,
        lastName: isUser.lastName,
      },
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(404).send({
      message: "Invalid credentials",
    });
  }
};

const getUser = async (req, res) => {
  const { id } = req.params;
  try {
    let user = await UserModel.findById(id);
    res.status(200).send({
      message: "All user retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      message: "User not retrieved suucessfully",
    });
  }
};

const verifyUser = async (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET, async function (err, decoded) {
        if (err) {
            return res.status(401).send({ message: "User Unauthorized" });
        }

        // Check if account is deactivated
        const user = await UserModel.findById(decoded.id);
        if (!user || user.isActive === false) {
            return res.status(403).send({ message: "Your account has been deactivated. Contact support." });
        }

        req.user = decoded;
        next();
    });
};

const getMe = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select("-password");

      if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    res.status(200).send({
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
     console.log("GET ME ERROR:", error.message);
    res
      .status(500)
      .send({ message: "Failed to fetch user", error: error.message });
  }
};

// =====================
// GET ALL USERS
// GET /api/v1/admin/users
// =====================
const getAllUsers = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        const { page = 1, limit = 20, search } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName:  { $regex: search, $options: "i" } },
                { email:     { $regex: search, $options: "i" } },
            ];
        }

        const [users, total] = await Promise.all([
            UserModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-password"),
            UserModel.countDocuments(filter),
        ]);

        res.status(200).send({
            message: "Users fetched successfully",
            total,
            page: Number(page),
            totalPages: Math.ceil(total / limit),
            data: users,
        });

    } catch (error) {
        console.log("GET ALL USERS ERROR:", error.message);
        res.status(500).send({ message: "Failed to fetch users" });
    }
};

// =====================
// MAKE / REMOVE ADMIN
// PUT /api/v1/admin/users/:userId/role
// =====================
const updateUserRole = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        const { userId } = req.params;
        const { roles } = req.body; // "admin" or "user"

        // Prevent admin from demoting themselves
        if (userId === req.user.id) {
            return res.status(400).send({ message: "You cannot change your own role" });
        }

        if (!["admin", "user"].includes(roles)) {
            return res.status(400).send({ message: "Invalid role" });
        }

        const user = await UserModel.findByIdAndUpdate(
            userId,
            { roles },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).send({ message: "User not found" });
        }

        res.status(200).send({
            message: `User is now ${roles === "admin" ? "an admin" : "a regular user"}`,
            data: user,
        });

    } catch (error) {
        console.log("UPDATE USER ROLE ERROR:", error.message);
        res.status(500).send({ message: "Failed to update user role" });
    }
};

// =====================
// DEACTIVATE / REACTIVATE USER
// PUT /api/v1/admin/users/:userId/status
// =====================
const updateUserStatus = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        const { userId } = req.params;
        const { isActive } = req.body; // true or false

        if (userId === req.user.id) {
            return res.status(400).send({ message: "You cannot deactivate your own account" });
        }

        const user = await UserModel.findByIdAndUpdate(
            userId,
            { isActive },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).send({ message: "User not found" });
        }

        res.status(200).send({
            message: isActive ? "User account reactivated" : "User account deactivated",
            data: user,
        });

    } catch (error) {
        console.log("UPDATE USER STATUS ERROR:", error.message);
        res.status(500).send({ message: "Failed to update user status" });
    }
};

// =====================
// DELETE USER (permanent)
// DELETE /api/v1/admin/users/:userId
// =====================
const adminDeleteUser = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        const { userId } = req.params;

        if (userId === req.user.id) {
            return res.status(400).send({ message: "You cannot delete your own account" });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).send({ message: "User not found" });
        }

        // Delete all their posts too
        await PostModel.deleteMany({ author: userId });
        await UserModel.findByIdAndDelete(userId);

        res.status(200).send({ message: "User and all their posts deleted successfully" });

    } catch (error) {
        console.log("ADMIN DELETE USER ERROR:", error.message);
        res.status(500).send({ message: "Failed to delete user" });
    }
};

// =============================
// REQUEST-OTP

const requestOTP = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    const sendOTP = otpgen.generate(4, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
      digits: true,
    });

    await OTPModel.deleteMany({ email });
    await OTPModel.create({ email, otp: sendOTP });

    const otpMailContent = await mailSender("otpMail.ejs", {
      otp: sendOTP,
      firstName: user.firstName,
    });

    const mailOptions = {
      from: process.env.NODE_MAIL,
      to: email,
      subject: "Your OTP Code — Amebo Naija",
      html: otpMailContent,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("OTP email sent to:", email);
    } catch (emailError) {
      console.log("OTP EMAIL FAILED:", emailError.message);
    }

    res.status(200).send({ message: "OTP sent successfully" });

  } catch (error) {
    console.log("REQUEST OTP ERROR:", error.message);
    res.status(400).send({ message: "OTP request failed" });
  }
};



module.exports = {
  createUser,
  login,
  getUser,
  getAllUsers,
  verifyUser,
  getMe,
  updateUserRole,
  updateUserStatus,
  adminDeleteUser,
  requestOTP
};
