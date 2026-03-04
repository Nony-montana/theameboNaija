const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const otpgen = require("otp-generator");
const UserModel = require("../models/user.model");
const PostModel = require("../models/post.model");
const OTPModel = require("../models/otp.model");
const mailSender = require("../middleware/mail");
const nodemailer = require("nodemailer");

// ─────────────────────────────────────────
// NODEMAILER TRANSPORTER
// ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.NODE_MAIL,
        pass: process.env.NODE_PASS,
    },
});

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
// FORGOT PASSWORD — sends OTP via crypto (alternative flow)
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

        const otpMailContent = await mailSender("otpMail.ejs", {
            otp,
            firstName: user.firstName,
        });

        const mailOptions = {
            from: process.env.NODE_MAIL,
            to: email,
            subject: "Your Password Reset OTP — Amebo Naija",
            html: otpMailContent,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("Forgot password OTP sent to:", email);
        } catch (emailError) {
            console.log("FORGOT PASSWORD EMAIL FAILED:", emailError.message);
        }

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
// ─────────────────────────────────────────
const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp)
            return res.status(400).send({ message: "Email and OTP are required" });

        // Look up OTP in OTPModel
        const otpRecord = await OTPModel.findOne({ email, otp });

        if (!otpRecord)
            return res.status(400).send({ message: "Invalid or expired OTP" });

        // OTP is valid — delete it so it can't be reused
        await OTPModel.deleteMany({ email });

        // Issue a short-lived reset token
        const user = await UserModel.findOne({ email });
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
        await user.save();

        res.status(200).send({ message: "Password reset successful. You can now log in." });

    } catch (error) {
        console.log("RESET PASSWORD ERROR:", error.message);
        res.status(500).send({ message: "Failed to reset password", error: error.message });
    }
};

// ─────────────────────────────────────────
// UPDATE PROFILE (logged in)
// PUT /api/v1/auth/update-profile
// ─────────────────────────────────────────
const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, email } = req.body;

        if (!firstName || !lastName || !email)
            return res.status(400).send({ message: "All fields are required" });

        const existingEmail = await UserModel.findOne({ email, _id: { $ne: req.user.id } });
        if (existingEmail)
            return res.status(409).send({ message: "Email is already in use by another account" });

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
   
    forgotPassword,
    verifyOtp,
    resetPassword,
    updateProfile,
    changePassword,
    deleteAccount,
    generateToken,
};