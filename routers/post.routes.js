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
    previewPost
} = require("../controllers/post.controller");


// =====================
// PUBLIC ROUTES
// (anyone can access these, no login needed)
// =====================
router.get("/posts", getAllPosts);
router.get("/posts/search", searchPosts);
router.get("/posts/trending", getTrendingPosts);
router.get("/posts/:slug", getSinglePost);
router.get("/my-posts", verifyUser, getMyPosts);


// =====================
// PROTECTED ROUTES
// (you must be logged in to access these)
// verifyUser checks your token before allowing access
// =====================

// Post CRUD
router.post("/posts", verifyUser,  createPost);
router.put("/posts/:slug", verifyUser, upload.single("image"), updatePost);
router.delete("/posts/:slug", verifyUser, deletePost);

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