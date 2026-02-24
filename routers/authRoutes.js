const express = require("express");
const router = express.Router();
const {
    register,
    login,
    forgotPassword,
    verifyOtp,
    resetPassword,
    changePassword,
    deleteAccount,
    updateProfile,
} = require("../controllers/auth.controller");
const { verifyUser } = require("../controllers/user.controller");

// Public
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

// Protected
router.put("/change-password", verifyUser, changePassword);
router.delete("/delete-account", verifyUser, deleteAccount);
router.put("/update-profile", verifyUser, updateProfile);

module.exports = router;