const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const UserModel = require("../models/user.model");     // adjust path if needed
const PostModel = require("../models/post.model");     // adjust path if needed
const { sendEmail } = require("../utils/sendEmail");   // adjust path if needed

// ─────────────────────────────────────────
// HELPER: generate signed JWT
// ─────────────────────────────────────────
const generateToken = (user) =>
    jwt.sign(
        { id: user._id, roles: user.roles },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

// ─────────────────────────────────────────
// REGISTER
// POST /api/v1/auth/register
// ─────────────────────────────────────────
const register = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        if (!firstName || !lastName || !email || !password)
            return res.status(400).send({ message: "All fields are required" });

        if (password.length < 6)
            return res.status(400).send({ message: "Password must be at least 6 characters" });

        const existingEmail = await UserModel.findOne({ email });
        if (existingEmail)
            return res.status(409).send({ message: "Email is already registered" });

        

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await UserModel.create({
            firstName,
                lastName: user.lastName,
            email,
            password: hashedPassword,
        });

        const token = generateToken(user);

        res.status(201).send({
            message: "Account created successfully",
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                roles: user.roles,
            },
        });

    } catch (error) {
        console.log("REGISTER ERROR:", error.message);
        res.status(500).send({ message: "Registration failed", error: error.message });
    }
};

// ─────────────────────────────────────────
// LOGIN
// POST /api/v1/auth/login
// ─────────────────────────────────────────
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).send({ message: "Email and password are required" });

        const user = await UserModel.findOne({ email }).select("+password");
        if (!user)
            return res.status(401).send({ message: "Invalid email or password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).send({ message: "Invalid email or password" });

        const token = generateToken(user);

        res.status(200).send({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                roles: user.roles,
            },
        });

    } catch (error) {
        console.log("LOGIN ERROR:", error.message);
        res.status(500).send({ message: "Login failed", error: error.message });
    }
};
// ─────────────────────────────────────────
// UPDATE PROFILE (logged in)
// PUT /api/v1/auth/update-profile
// ─────────────────────────────────────────
const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, email } = req.body;

        if (!firstName || !lastName || !email) {
            return res.status(400).send({ message: "All fields are required" });
        }

        // If email is being changed, check it's not already taken by another user
        const existingEmail = await UserModel.findOne({ email, _id: { $ne: req.user.id } });
        if (existingEmail) {
            return res.status(409).send({ message: "Email is already in use by another account" });
        }

        const updatedUser = await UserModel.findByIdAndUpdate(
            req.user.id,
            { firstName, lastName, email },
            { new: true, runValidators: true }
        );

        res.status(200).send({
            message: "Profile updated successfully",
            data: {
                id: updatedUser._id,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                email: updatedUser.email,
                roles: updatedUser.roles,
            },
        });

    } catch (error) {
        console.log("UPDATE PROFILE ERROR:", error.message);
        res.status(500).send({ message: "Failed to update profile", error: error.message });
    }
};

// ─────────────────────────────────────────
// FORGOT PASSWORD — STEP 1: Send OTP
// POST /api/v1/auth/forgot-password
// ─────────────────────────────────────────
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email)
            return res.status(400).send({ message: "Email is required" });

        const user = await UserModel.findOne({ email });

        // Always return 200 — prevents email enumeration attacks
        if (!user) {
            return res.status(200).send({
                message: "If an account with that email exists, an OTP has been sent",
            });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Hash before storing — never save raw OTPs in the DB
        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

        user.resetPasswordOtp = hashedOtp;
        user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        await sendEmail({
            to: user.email,
            subject: "Your Password Reset OTP — TheAmeboNaija",
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
                    <h2 style="color: #16a34a;">Password Reset OTP</h2>
                    <p>Hi ${user.firstName || "there"},</p>
                    <p>Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
                    <div style="
                        font-size: 36px;
                        font-weight: bold;
                        letter-spacing: 10px;
                        color: #16a34a;
                        background: #f0fdf4;
                        border: 2px dashed #16a34a;
                        border-radius: 8px;
                        padding: 20px;
                        text-align: center;
                        margin: 24px 0;
                    ">${otp}</div>
                    <p style="color: #888; font-size: 13px;">
                        If you didn't request this, ignore this email. Your password won't change.
                    </p>
                </div>
            `,
        });

        res.status(200).send({
            message: "If an account with that email exists, an OTP has been sent",
        });

    } catch (error) {
        console.log("FORGOT PASSWORD ERROR:", error.message);
        res.status(500).send({ message: "Failed to send OTP", error: error.message });
    }
};

// ─────────────────────────────────────────
// VERIFY OTP — STEP 2
// POST /api/v1/auth/verify-otp
// Returns a short-lived resetToken on success
// ─────────────────────────────────────────
const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp)
            return res.status(400).send({ message: "Email and OTP are required" });

        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

        const user = await UserModel.findOne({
            email,
            resetPasswordOtp: hashedOtp,
            resetPasswordOtpExpires: { $gt: Date.now() },
        });

        if (!user)
            return res.status(400).send({ message: "Invalid or expired OTP" });

        // Issue a short-lived token only valid for resetting the password
        const resetToken = jwt.sign(
            { id: user._id, purpose: "reset" },
            process.env.JWT_SECRET,
            { expiresIn: "10m" }
        );

        res.status(200).send({ message: "OTP verified", resetToken });

    } catch (error) {
        console.log("VERIFY OTP ERROR:", error.message);
        res.status(500).send({ message: "OTP verification failed", error: error.message });
    }
};

// ─────────────────────────────────────────
// RESET PASSWORD — STEP 3
// POST /api/v1/auth/reset-password
// ─────────────────────────────────────────
const resetPassword = async (req, res) => {
    try {
        const { resetToken, password, confirmPassword } = req.body;

        if (!resetToken || !password || !confirmPassword)
            return res.status(400).send({ message: "All fields are required" });

        if (password !== confirmPassword)
            return res.status(400).send({ message: "Passwords do not match" });

        if (password.length < 6)
            return res.status(400).send({ message: "Password must be at least 6 characters" });

        let decoded;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        } catch {
            return res.status(400).send({ message: "Reset session expired. Please start over." });
        }

        if (decoded.purpose !== "reset")
            return res.status(400).send({ message: "Invalid reset token" });

        const user = await UserModel.findById(decoded.id).select("+password");
        if (!user)
            return res.status(404).send({ message: "User not found" });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpires = undefined;
        await user.save();

        res.status(200).send({ message: "Password reset successful. You can now log in." });

    } catch (error) {
        console.log("RESET PASSWORD ERROR:", error.message);
        res.status(500).send({ message: "Failed to reset password", error: error.message });
    }
};

// ─────────────────────────────────────────
// CHANGE PASSWORD (logged in)
// PUT /api/v1/auth/change-password
// ─────────────────────────────────────────
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword)
            return res.status(400).send({ message: "All fields are required" });

        if (newPassword !== confirmNewPassword)
            return res.status(400).send({ message: "New passwords do not match" });

        if (newPassword.length < 6)
            return res.status(400).send({ message: "New password must be at least 6 characters" });

        if (currentPassword === newPassword)
            return res.status(400).send({ message: "New password must be different from current password" });

        const user = await UserModel.findById(req.user.id).select("+password");
        if (!user)
            return res.status(404).send({ message: "User not found" });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(401).send({ message: "Current password is incorrect" });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).send({ message: "Password changed successfully" });

    } catch (error) {
        console.log("CHANGE PASSWORD ERROR:", error.message);
        res.status(500).send({ message: "Failed to change password", error: error.message });
    }
};

// ─────────────────────────────────────────
// DELETE ACCOUNT (logged in)
// DELETE /api/v1/auth/delete-account
// ─────────────────────────────────────────
const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password)
            return res.status(400).send({ message: "Please enter your password to confirm" });

        const user = await UserModel.findById(req.user.id).select("+password");
        if (!user)
            return res.status(404).send({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).send({ message: "Incorrect password" });

        await PostModel.deleteMany({ author: req.user.id });
        await UserModel.findByIdAndDelete(req.user.id);

        res.status(200).send({ message: "Account deleted successfully" });

    } catch (error) {
        console.log("DELETE ACCOUNT ERROR:", error.message);
        res.status(500).send({ message: "Failed to delete account", error: error.message });
    }
};

module.exports = {
    register,
    login,
    forgotPassword,
    verifyOtp,
    resetPassword,
    changePassword,
    deleteAccount,
    updateProfile
};