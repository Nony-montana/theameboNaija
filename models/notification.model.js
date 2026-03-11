const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: ["like", "comment", "approved", "rejected", "new_post"],
      required: true,
    },
    message: { type: String, required: true },
    postSlug: { type: String },
    postTitle: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const NotificationModel =mongoose.model("Notification", notificationSchema);
module.exports = NotificationModel;