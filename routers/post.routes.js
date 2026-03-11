const express = require("express");
const router = express.Router();
const { verifyUser } = require("../controllers/user.controller");
const { upload } = require("../config/cloudinary");
const { getNotifications, markAsRead, markAllAsRead } = require("../controllers/notification.controller");
const {
  createPost,
  getAllPosts,
  getSinglePost,
  updatePost,
  deletePost,
  approvePost,
  rejectPost,
  getPendingPosts,
  likePost,
  sharePost,
  addComment,
  deleteComment,
  searchPosts,
  getTrendingPosts,
  getMyPosts,
  previewPost,
  editComment,
  getAdminStats,
  adminGetAllPosts,
  adminDeletePost,
  adminGetAllComments,
  adminDeleteComment,
} = require("../controllers/post.controller");

// =====================
// SPECIFIC ROUTES FIRST (before any :slug catch-alls)
// =====================
router.get("/posts", getAllPosts);
router.get("/posts/search", searchPosts);
router.get("/posts/trending", getTrendingPosts);
router.get("/posts/preview/:slug", verifyUser, previewPost);
router.get("/posts/admin/pending", verifyUser, getPendingPosts);

// =====================
// :slug catch-all LAST
// =====================
router.get("/posts/:slug", getSinglePost);

// =====================
// MY POSTS
// =====================
router.get("/my-posts", verifyUser, getMyPosts);

// =====================
// POST CRUD
// =====================
router.post("/posts", verifyUser, createPost);
router.put("/posts/:slug", verifyUser, upload.single("image"), updatePost);
router.delete("/posts/:slug", verifyUser, deletePost);

// =====================
// LIKES, SHARES & COMMENTS
// =====================
router.post("/posts/:slug/like", verifyUser, likePost);
router.post("/posts/:slug/share", verifyUser, sharePost);
router.post("/posts/:slug/comment", verifyUser, addComment);
router.delete("/posts/:slug/comment/:commentId", verifyUser, deleteComment);
router.put("/posts/:slug/comment/:commentId", verifyUser, editComment);

// =====================
// APPROVE / REJECT
// =====================
router.put("/posts/:slug/approve", verifyUser, approvePost);
router.put("/posts/:slug/reject", verifyUser, rejectPost);

// =====================
// ADMIN ROUTES
// =====================
router.get("/admin/stats", verifyUser, getAdminStats);
router.get("/admin/posts", verifyUser, adminGetAllPosts);
router.delete("/admin/posts/:slug", verifyUser, adminDeletePost);
router.get("/admin/comments", verifyUser, adminGetAllComments);
router.delete("/admin/posts/:slug/comment/:commentId", verifyUser, adminDeleteComment);

// Notification routes
router.get("/notifications", verifyUser, getNotifications);
router.put("/notifications/read-all", verifyUser, markAllAsRead);
router.put("/notifications/:id/read", verifyUser, markAsRead);

module.exports = router;