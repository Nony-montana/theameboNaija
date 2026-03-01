const express = require("express");
const router = express.Router();
const { verifyUser } = require("../controllers/user.controller");
const { upload } = require("../config/cloudinary");
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
} = require("../controllers/post.controller");

// =====================
// PUBLIC ROUTES
// =====================
router.get("/posts", getAllPosts);
router.get("/posts/search", searchPosts);
router.get("/posts/trending", getTrendingPosts);
router.get("/posts/:slug", getSinglePost);
router.get("/my-posts", verifyUser, getMyPosts);

// Post CRUD
router.post("/posts", verifyUser, createPost);
router.put("/posts/:slug", verifyUser, upload.single("image"), updatePost);
router.delete("/posts/:slug", verifyUser, deletePost);

// Likes, shares & comments
router.post("/posts/:slug/like", verifyUser, likePost);
router.post("/posts/:slug/share", verifyUser, sharePost);
router.post("/posts/:slug/comment", verifyUser, addComment);
router.delete("/posts/:slug/comment/:commentId", verifyUser, deleteComment);
router.put("/posts/:slug/comment/:commentId", verifyUser, editComment);

// Admin only routes
router.get("/posts/admin/pending", verifyUser, getPendingPosts);
router.put("/posts/:slug/approve", verifyUser, approvePost);
router.get("/posts/admin/preview/:slug", verifyUser, previewPost);
router.put("/posts/:slug/reject", verifyUser, rejectPost);
router.get("/admin/stats", verifyUser, getAdminStats);
router.get("/admin/posts", verifyUser, adminGetAllPosts);
router.delete("/admin/posts/:slug", verifyUser, adminDeletePost);

module.exports = router;
