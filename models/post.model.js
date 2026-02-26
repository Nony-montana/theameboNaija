const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    category: { 
        type: String, 
        enum: ["news", "gist", "gossip", "entertainment", "lifestyle", "sports"], 
        required: true 
    },
    image: { type: String },
    tags: [{ type: String }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    comments: [CommentSchema],
    shares: { type: Number, default: 0 },
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    approvedAt: { type: Date },
    status: { 
        type: String, 
        enum: ["draft", "pending", "published", "rejected"], 
        default: "draft" 
    },
    views: { type: Number, default: 0 },
    slug: { type: String, unique: true }

}, { timestamps: true });

const PostModel = mongoose.model("post", PostSchema);

module.exports = PostModel;