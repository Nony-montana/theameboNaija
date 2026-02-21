const express = require ('express');
const { createUser, login, verifyUser, getAllUsers, getUser, getMe } = require('../controllers/user.controller');
const router = express.Router();



router.post("/register", createUser);
router.post("/login", login);
router.get("/allusers/:id", verifyUser, getUser)
router.get("/getallusers",verifyUser, getAllUsers)
router.get("/me",verifyUser,getMe)


module.exports=router;
