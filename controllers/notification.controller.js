const NotificationModel = require("../models/notification.model");

// GET all notifications for logged-in user
const getNotifications = async (req, res) => {
  try {
    const notifications = await NotificationModel.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("sender", "firstName lastName");

    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

// MARK single notification as read
const markAsRead = async (req, res) => {
  try {
    await NotificationModel.findByIdAndUpdate(req.params.id, { isRead: true });
    res.status(200).json({ success: true, message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to mark as read" });
  }
};

// MARK all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    await NotificationModel.updateMany({ recipient: req.user.id, isRead: false }, { isRead: true });
    res.status(200).json({ success: true, message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to mark all as read" });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };