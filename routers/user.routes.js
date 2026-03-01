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
} = require("../controllers/user.controller");
const router = express.Router();

router.post("/register", createUser);
router.post("/login", login);
router.get("/allusers/:id", verifyUser, getUser);
router.get("/getallusers", verifyUser, getAllUsers);
router.get("/me", verifyUser, getMe);
router.put("/admin/users/:userId/role", verifyUser, updateUserRole);
router.put("/admin/users/:userId/status", verifyUser, updateUserStatus);
router.delete("/admin/users/:userId", verifyUser, adminDeleteUser);
// router.get("/admin/users",                    verifyUser, getAllUsers);

module.exports = router;
