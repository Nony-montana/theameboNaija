const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const dotenv = require("dotenv");

dotenv.config();


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});


const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "blog-images",        // images will be saved in a folder called "blog-images" on Cloudinary
        allowed_formats: ["jpg", "jpeg", "png", "webp"],  // only these image types are allowed
        transformation: [{ width: 1200, quality: "auto" }]  // auto-optimize image size
    }
});

const upload = multer({ storage });

module.exports = { upload, cloudinary };