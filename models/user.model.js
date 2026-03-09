const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // select: false — password is never returned in queries unless you explicitly add .select("+password")
    password: { type: String, required: true, select: false },
    roles: { type: String, enum: ["user", "admin"], default: "user" },
    isActive: { type: Boolean, default: true },
    // OTP fields for forgot password flow
    resetPasswordOtp: { type: String, default: null },
    resetPasswordOtpExpires: { type: Date, default: null },
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "post" }],
  },
  {
    timestamps: true,
    // CHANGED: "throw" → false
    // strict: "throw" crashes the server whenever any unrecognised field reaches the model
    // (e.g. from req.body leakage). false silently ignores unknown fields instead.
    strict: false,
  },
);

const UserModel = mongoose.model("user", UserSchema);

module.exports = UserModel;
