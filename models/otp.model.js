const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
        },
        otp: {
            type: String,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 300, // auto-deletes after 10 minutes
        },
    }
);

const OTPModel = mongoose.model("OTP", otpSchema);
module.exports = OTPModel;