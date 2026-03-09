const express = require("express");
const {
  createUser,
  login,
  verifyUser,
  getAllUsers,
  getUser,
  getMe,
  updateUserRole,
  updateUserStatus,
  adminDeleteUser,
  requestOTP,
  getAuthorProfile
} = require("../controllers/user.controller");
const { toggleBookmark, getBookmarks } = require("../controllers/bookmark.controller");
const router = express.Router();

router.post("/register", createUser);
router.post("/login", login);
router.get("/allusers/:id", verifyUser, getUser);
router.get("/getallusers", verifyUser, getAllUsers);
router.post('/request-otp',requestOTP)
router.get("/me", verifyUser, getMe);
router.put("/admin/users/:userId/role", verifyUser, updateUserRole);
router.put("/admin/users/:userId/status", verifyUser, updateUserStatus);
router.delete("/admin/users/:userId", verifyUser, adminDeleteUser);
router.get("/users/:id/profile", getAuthorProfile);
router.post("/bookmark/:postId", verifyUser, toggleBookmark);
router.get("/bookmarks", verifyUser, getBookmarks);

module.exports = router;
