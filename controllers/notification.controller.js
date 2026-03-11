const getNotifications = async (req, res) => {
  try {
    console.log("GET NOTIFICATIONS - req.user:", req.user); // ← add this
    const notifications = await NotificationModel.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("sender", "firstName lastName");

    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    console.log("GET NOTIFICATIONS ERROR:", err.message); // ← add this
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};