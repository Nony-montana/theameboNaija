const UserModel = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const welcomeEmail = require("../email/welcomeEmail");
const { sendEmail } = require("../utils/sendEmail");

const createUser = async (req, res) => {
  const { lastName, firstName, email, password } = req.body;

  try {
    const saltround = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, saltround);

    const user = await UserModel.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    const token = await jwt.sign(
      { id: user._id, roles: user.roles },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    // Welcome email in its own try/catch so a mail failure
    // never breaks registration or returns an error to the user
    try {
      await sendEmail({
        to: email,
        subject: "Welcome to Amebonaija! 🎉",
        html: welcomeEmail(firstName),
      });
    } catch (emailError) {
      // Log the failure but don't block the registration response
      console.log("WELCOME EMAIL FAILED:", emailError.message);
    }

    res.status(201).send({
      message: "User created successfully",
      data: {
        lastName,
        firstName,
        email,
        roles: user.roles,
      },
      token,
    });
  } catch (error) {
    console.log(error);

    if (error.code == 11000) {
      return res.status(400).send({ message: "User already exist" });
    }

    res.status(400).send({ message: "User creation failed" });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const isUser = await UserModel.findOne({ email }).select("+password");
    if (!isUser) {
      res.status(404).send({
        message: "Invalid credentials",
      });

      return;
    }

    const isMatch = await bcrypt.compare(password, isUser.password);
    if (!isMatch) {
      res.status(404).send({
        message: "Invalid credentials",
      });

      return;
    }

    const token = await jwt.sign(
      { id: isUser._id, roles: isUser.roles },
      process.env.JWT_SECRET,
      { expiresIn: "5h" },
    );
    res.status(200).send({
      message: "User logged in successfully",
      data: {
        email: isUser.email,
        roles: isUser.roles,
        firstName: isUser.firstName,
        lastName: isUser.lastName,
      },
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(404).send({
      message: "Invalid credentials",
    });
  }
};

const getUser = async (req, res) => {
  const { id } = req.params;
  try {
    let user = await UserModel.findById(id);
    res.status(200).send({
      message: "All user retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      message: "User not retrieved suucessfully",
    });
  }
};

const getAllUsers = async (req, res) => {
  const user = req.user.roles;
  try {
    if (user !== "admin") {
      return res.status(403).send({
        message: "Forbidden request",
      });
    }

    let users = await UserModel.find().select("-password ");
    res.status(200).send({
      message: "users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.log(error);

    res.status(400).send({
      message: "users not retrieved found",
    });
  }
};

const verifyUser = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  // ? req.headers["authorization"].split("")[1];
  // : req.headers["authorization"].split("")[0];

  jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
    if (err) {
      res.status(401).send({
        message: " User Unauthorized",
      });
      return;
    }

    console.log(decoded);

    req.user = decoded;
    next();
  });
};

const getMe = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select("-password");

      if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    res.status(200).send({
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
     console.log("GET ME ERROR:", error.message);
    res
      .status(500)
      .send({ message: "Failed to fetch user", error: error.message });
  }
};


module.exports = {
  createUser,
  login,
  getUser,
  getAllUsers,
  verifyUser,
  getMe,
};
