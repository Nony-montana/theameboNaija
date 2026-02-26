const express = require("express");
const router = express.Router();
const { verifyUser } = require("../controllers/user.controller");
const { upload } = require("../config/cloudinary");
const {
    createPost,
    getAllPosts,
    getSinglePost,
    updatePost,
    // deletePost,
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
    previewPost
} = require("../controllers/post.controller");

const {
    getMe,
    updateProfile,
    changePassword,
    deleteAccount,
    forgotPassword,
    verifyOtp,
    resetPassword,
} = require("../controllers/auth.controller");


// =====================
// PUBLIC ROUTES
// =====================
router.get("/posts", getAllPosts);
router.get("/posts/search", searchPosts);
router.get("/posts/trending", getTrendingPosts);
router.get("/posts/:slug", getSinglePost);
router.get("/my-posts", verifyUser, getMyPosts);

// Auth — public
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/verify-otp", verifyOtp);
router.post("/auth/reset-password", resetPassword);


// =====================
// PROTECTED ROUTES
// =====================

// Auth — protected
router.get("/auth/me", verifyUser, getMe);
router.put("/auth/update-profile", verifyUser, updateProfile);
router.put("/auth/change-password", verifyUser, changePassword);
router.delete("/auth/delete-account", verifyUser, deleteAccount);

// Post CRUD
router.post("/posts", verifyUser, createPost);
router.put("/posts/:slug", verifyUser, upload.single("image"), updatePost);
// router.delete("/posts/:slug", verifyUser, deletePost);

// Likes, shares & comments
router.post("/posts/:slug/like", verifyUser, likePost);
router.post("/posts/:slug/share", verifyUser, sharePost);
router.post("/posts/:slug/comment", verifyUser, addComment);
router.delete("/posts/:slug/comment/:commentId", verifyUser, deleteComment);

// Admin only routes
router.get("/posts/admin/pending", verifyUser, getPendingPosts);
router.put("/posts/:slug/approve", verifyUser, approvePost);
router.get("/posts/admin/preview/:slug", verifyUser, previewPost);
router.put("/posts/:slug/reject", verifyUser, rejectPost);


module.exports = router;