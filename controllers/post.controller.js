const { cloudinary } = require("../config/cloudinary");
const mailSender = require("../middleware/mail");
const PostModel = require("../models/post.model");
const UserModel = require("../models/user.model");
const NotificationModel = require("../models/notification.model");
const nodemailer = require("nodemailer");


// =====================
// HELPER FUNCTION
// =====================
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
};

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.NODE_MAIL,
        pass: process.env.NODE_PASS,
    },
});

// =====================
// CREATE A POST
// =====================
const createPost = async (req, res) => {
  const { title, content, category, status, tags, image } = req.body;

  try {
    const slug = generateSlug(title);

    const existingPost = await PostModel.findOne({ slug });
    if (existingPost) {
      return res.status(400).send({
        message: "A post with this title already exists",
      });
    }

    let imageUrl = "";
    if (image && image.startsWith("data:image")) {
      const uploadResult = await cloudinary.uploader.upload(image, {
        folder: "blog-images",
        transformation: [{ width: 1200, quality: "auto" }],
      });
      imageUrl = uploadResult.secure_url;
    }

    const post = await PostModel.create({
      title,
      slug,
      content,
      image: imageUrl,
      category,
      tags: tags || [],
      status: status || "draft",
      author: req.user.id,
    });

    res.status(201).send({
      message: "Post created successfully",
      data: post,
    });
  } catch (error) {
    console.log("CREATE POST ERROR:", error.message);
    res.status(500).send({
      message: "Failed to create post",
      error: error.message,
    });
  }
};

// =====================
// GET ALL PUBLISHED & APPROVED POSTS
// =====================
const getAllPosts = async (req, res) => {
  try {
    const { category, tag, page = 1, limit = 11 } = req.query;

    const filter = { status: "published", isApproved: true };
    if (category) filter.category = category;
    if (tag) filter.tags = tag;

    const skip = (page - 1) * limit;

    const posts = await PostModel.find(filter)
      .populate("author", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await PostModel.countDocuments(filter);

    res.status(200).send({
      message: "Posts fetched successfully",
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      data: posts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch posts" });
  }
};

// =====================
// GET A SINGLE POST (by slug)
// =====================
const getSinglePost = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await PostModel.findOne({
      slug,
      status: "published",
      isApproved: true,
    })
      .populate("author", "firstName lastName")
      .populate("comments.user", "firstName lastName");

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    post.views += 1;
    await post.save();

    res.status(200).send({
      message: "Post fetched successfully",
      data: post,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch post" });
  }
};

// =====================
// UPDATE / EDIT A POST
// =====================
const updatePost = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, status } = req.body;

    const post = await PostModel.findOne({ slug });

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    if (post.author.toString() !== req.user.id && req.user.roles !== "admin") {
      return res.status(403).send({ message: "You are not allowed to edit this post" });
    }

    const updateData = {
      title: title || post.title,
      content: req.body.content || post.content,
      category: req.body.category || post.category,
      status: status === "draft" ? "draft" : "pending",
    };

    if (req.body.tags) {
      try {
        updateData.tags = JSON.parse(req.body.tags);
      } catch {
        updateData.tags = req.body.tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }

    if (req.file) {
      updateData.image = req.file.path;
    }

    if (title && title !== post.title) {
      updateData.slug = generateSlug(title);
    }

    if (updateData.status === "pending") {
      updateData.isApproved = false;
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    const updatedPost = await PostModel.findByIdAndUpdate(
      post._id,
      updateData,
      { new: true, runValidators: true },
    );

    res.status(200).send({
      message: "Post updated successfully, it will be reviewed by an admin before publishing",
      data: updatedPost,
    });
  } catch (error) {
    console.log("UPDATE POST ERROR:", error.message);
    res.status(500).send({ message: "Failed to update post", error: error.message });
  }
};

// =====================
// APPROVE A POST (admin only)
// =====================
const approvePost = async (req, res) => {
  try {
    const { slug } = req.params;

    if (req.user.roles !== "admin") {
      return res.status(403).send({ message: "Only admins can approve posts" });
    }

    const post = await PostModel.findOneAndUpdate(
      { slug },
      {
        isApproved: true,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        status: "published",
      },
      { new: true }
    ).populate("author", "firstName lastName email");

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    // Create notification for the author
    try {
      await NotificationModel.create({
        recipient: post.author._id,
        sender: req.user.id,
        type: "approved",
        message: `🎉 Your post has been approved and is now live!`,
        postSlug: post.slug,
        postTitle: post.title,
      });
    } catch (notifError) {
      console.log("Approval notification failed:", notifError.message);
    }

    // Send approval email
    try {
      const emailContent = await mailSender("approvedMail.ejs", {
        firstName: post.author.firstName,
        postTitle: post.title,
        category: post.category,
        postUrl: `https://amebonaija.vercel.app/post/${post.slug}`,
      });

      await transporter.sendMail({
        from: process.env.NODE_MAIL,
        to: post.author.email,
        subject: "🎉 Your Post is Live on Amebo Naija!",
        html: emailContent,
      });
    } catch (emailError) {
      console.log("Approval email failed:", emailError.message);
    }

    res.status(200).send({
      message: "Post approved and published successfully",
      data: post,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to approve post" });
  }
};

// =====================
// REJECT A POST (admin only)
// =====================
const rejectPost = async (req, res) => {
  try {
    const { slug } = req.params;

    if (req.user.roles !== "admin") {
      return res.status(403).send({ message: "Only admins can reject posts" });
    }

    const post = await PostModel.findOneAndUpdate(
      { slug },
      { status: "rejected", isApproved: false },
      { new: true }
    ).populate("author", "firstName lastName email");

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    // Create notification for the author
    try {
      await NotificationModel.create({
        recipient: post.author._id,
        sender: req.user.id,
        type: "rejected",
        message: `❌ Your post was not approved. Please review and resubmit.`,
        postSlug: post.slug,
        postTitle: post.title,
      });
    } catch (notifError) {
      console.log("Rejection notification failed:", notifError.message);
    }

    // Send rejection email
    try {
      const emailContent = await mailSender("rejectedMail.ejs", {
        firstName: post.author.firstName,
        postTitle: post.title,
        category: post.category,
      });

      await transporter.sendMail({
        from: process.env.NODE_MAIL,
        to: post.author.email,
        subject: "📋 Update on Your Amebo Naija Post Submission",
        html: emailContent,
      });
    } catch (emailError) {
      console.log("Rejection email failed:", emailError.message);
    }

    res.status(200).send({ message: "Post rejected", data: post });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to reject post" });
  }
};

// =====================
// PREVIEW POST
// =====================
const previewPost = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await PostModel.findOne({ slug })
      .populate("author", "firstName lastName")
      .populate("comments.user", "firstName lastName");

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    const isAdmin = req.user.roles === "admin";
    const isAuthor = post.author._id.toString() === req.user.id;

    if (!isAdmin && !isAuthor) {
      return res.status(403).send({ message: "You are not allowed to preview this post" });
    }

    res.status(200).send({ message: "Post fetched successfully", data: post });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch post" });
  }
};

// =====================
// GET ALL PENDING POSTS (admin only)
// =====================
const getPendingPosts = async (req, res) => {
  try {
    if (req.user.roles !== "admin") {
      return res.status(403).send({ message: "Only admins can view pending posts" });
    }

    const posts = await PostModel.find({ status: "pending" })
      .populate("author", "firstName lastName")
      .sort({ createdAt: -1 });

    res.status(200).send({
      message: "Pending posts fetched successfully",
      total: posts.length,
      data: posts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch pending posts" });
  }
};

// =====================
// LIKE / UNLIKE A POST
// =====================
const likePost = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user.id;

    const post = await PostModel.findOne({ slug }).populate("author", "firstName lastName");

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userId);

      // Notify the author only when liking (not unliking), and not if they like their own post
      if (post.author._id.toString() !== userId) {
        try {
          await NotificationModel.create({
            recipient: post.author._id,
            sender: userId,
            type: "like",
            message: `❤️ Someone liked your post!`,
            postSlug: post.slug,
            postTitle: post.title,
          });
        } catch (notifError) {
          console.log("Like notification failed:", notifError.message);
        }
      }
    }

    await post.save();

    res.status(200).send({
      message: alreadyLiked ? "Post unliked" : "Post liked",
      totalLikes: post.likes.length,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to like/unlike post" });
  }
};

// =====================
// SHARE A POST
// =====================
const sharePost = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await PostModel.findOne({ slug });

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    post.shares += 1;
    await post.save();

    res.status(200).send({ message: "Post shared successfully", totalShares: post.shares });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to share post" });
  }
};

// =====================
// ADD A COMMENT
// =====================
const addComment = async (req, res) => {
  try {
    const { slug } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const post = await PostModel.findOne({ slug }).populate("author", "firstName lastName");

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    post.comments.push({ user: userId, text });
    await post.save();

    // Notify the author, but not if they comment on their own post
    if (post.author._id.toString() !== userId) {
      try {
        await NotificationModel.create({
          recipient: post.author._id,
          sender: userId,
          type: "comment",
          message: `💬 Someone commented on your post!`,
          postSlug: post.slug,
          postTitle: post.title,
        });
      } catch (notifError) {
        console.log("Comment notification failed:", notifError.message);
      }
    }

    res.status(201).send({
      message: "Comment added successfully",
      totalComments: post.comments.length,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to add comment" });
  }
};

// =====================
// DELETE A COMMENT
// =====================
const deleteComment = async (req, res) => {
  try {
    const { slug, commentId } = req.params;

    const post = await PostModel.findOne({ slug });

    if (!post) return res.status(404).send({ message: "Post not found" });

    const comment = post.comments.id(commentId);

    if (!comment) return res.status(404).send({ message: "Comment not found" });

    if (comment.user.toString() !== req.user.id && req.user.roles !== "admin") {
      return res.status(403).send({ message: "You are not allowed to delete this comment" });
    }

    comment.deleteOne();
    await post.save();

    res.status(200).send({ message: "Comment deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to delete comment" });
  }
};

// =====================
// EDIT A COMMENT
// =====================
const editComment = async (req, res) => {
  try {
    const { slug, commentId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).send({ message: "Comment text is required" });
    }

    const post = await PostModel.findOne({ slug });

    if (!post) return res.status(404).send({ message: "Post not found" });

    const comment = post.comments.id(commentId);

    if (!comment) return res.status(404).send({ message: "Comment not found" });

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).send({ message: "You are not allowed to edit this comment" });
    }

    comment.text = text.trim();
    comment.editedAt = new Date();
    await post.save();

    res.status(200).send({ message: "Comment updated successfully" });
  } catch (error) {
    console.log("EDIT COMMENT ERROR:", error.message);
    res.status(500).send({ message: "Failed to edit comment" });
  }
};

// =====================
// DELETE A POST
// =====================
const deletePost = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await PostModel.findOne({ slug });

    if (!post) return res.status(404).send({ message: "Post not found" });

    if (post.author.toString() !== req.user.id && req.user.roles !== "admin") {
      return res.status(403).send({ message: "You are not allowed to delete this post" });
    }

    await PostModel.findByIdAndDelete(post._id);

    res.status(200).send({ message: "Post deleted successfully" });
  } catch (error) {
    console.log("DELETE POST ERROR:", error.message);
    res.status(500).send({ message: "Failed to delete post", error: error.message });
  }
};

// =====================
// SEARCH POSTS
// =====================
const searchPosts = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) return res.status(400).send({ message: "Please provide a search term" });

    const posts = await PostModel.find({
      status: "published",
      isApproved: true,
      $or: [
        { title: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ],
    })
      .populate("author", "firstName lastName")
      .sort({ createdAt: -1 });

    res.status(200).send({ message: "Search results", total: posts.length, data: posts });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Search failed" });
  }
};

// =====================
// GET MY POSTS
// =====================
const getMyPosts = async (req, res) => {
  try {
    const posts = await PostModel.find({ author: req.user.id }).sort({ createdAt: -1 });

    if (posts.length === 0) {
      return res.status(404).send({ message: "You have not created any posts yet" });
    }

    res.status(200).send({ message: "Your posts fetched successfully", total: posts.length, data: posts });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch your posts" });
  }
};

// =====================
// GET TRENDING POSTS
// =====================
const getTrendingPosts = async (req, res) => {
  try {
    const posts = await PostModel.find({ status: "published", isApproved: true })
      .populate("author", "firstName lastName")
      .sort({ views: -1 })
      .limit(10);

    res.status(200).send({ message: "Trending posts fetched successfully", data: posts });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch trending posts" });
  }
};

// =====================
// GET ADMIN STATS
// =====================
const getAdminStats = async (req, res) => {
  try {
    if (req.user.roles !== "admin") {
      return res.status(403).send({ message: "Access denied" });
    }

    const [
      totalPosts, totalUsers, totalComments,
      pendingPosts, publishedPosts, draftPosts, rejectedPosts,
      categoryBreakdown, recentPosts, recentUsers,
    ] = await Promise.all([
      PostModel.countDocuments(),
      UserModel.countDocuments(),
      PostModel.aggregate([
        { $project: { commentCount: { $size: "$comments" } } },
        { $group: { _id: null, total: { $sum: "$commentCount" } } },
      ]),
      PostModel.countDocuments({ status: "pending" }),
      PostModel.countDocuments({ status: "published" }),
      PostModel.countDocuments({ status: "draft" }),
      PostModel.countDocuments({ status: "rejected" }),
      PostModel.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PostModel.find().populate("author", "firstName lastName").sort({ createdAt: -1 }).limit(5).select("title status category createdAt author"),
      UserModel.find().sort({ createdAt: -1 }).limit(5).select("firstName lastName email roles createdAt"),
    ]);

    res.status(200).send({
      message: "Admin stats fetched successfully",
      data: {
        totals: {
          posts: totalPosts, users: totalUsers,
          comments: totalComments[0]?.total || 0,
          pending: pendingPosts, published: publishedPosts,
          drafts: draftPosts, rejected: rejectedPosts,
        },
        categoryBreakdown, recentPosts, recentUsers,
      },
    });
  } catch (error) {
    console.log("ADMIN STATS ERROR:", error.message);
    res.status(500).send({ message: "Failed to fetch admin stats" });
  }
};

// =====================
// ADMIN GET ALL POSTS
// =====================
const adminGetAllPosts = async (req, res) => {
  try {
    if (req.user.roles !== "admin") return res.status(403).send({ message: "Access denied" });

    const { page = 1, limit = 15, search, category, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) filter.title = { $regex: search, $options: "i" };
    if (category) filter.category = category;
    if (status) filter.status = status;

    const [posts, total] = await Promise.all([
      PostModel.find(filter)
        .populate("author", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("title category status views likes comments shares createdAt author slug image"),
      PostModel.countDocuments(filter),
    ]);

    res.status(200).send({ message: "Posts fetched successfully", total, page: Number(page), totalPages: Math.ceil(total / limit), data: posts });
  } catch (error) {
    console.log("ADMIN GET ALL POSTS ERROR:", error.message);
    res.status(500).send({ message: "Failed to fetch posts" });
  }
};

// =====================
// ADMIN DELETE POST
// =====================
const adminDeletePost = async (req, res) => {
  try {
    if (req.user.roles !== "admin") return res.status(403).send({ message: "Access denied" });

    const post = await PostModel.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).send({ message: "Post not found" });

    await PostModel.findByIdAndDelete(post._id);
    res.status(200).send({ message: "Post deleted successfully" });
  } catch (error) {
    console.log("ADMIN DELETE POST ERROR:", error.message);
    res.status(500).send({ message: "Failed to delete post" });
  }
};

// =====================
// ADMIN GET ALL COMMENTS
// =====================
const adminGetAllComments = async (req, res) => {
  try {
    if (req.user.roles !== "admin") return res.status(403).send({ message: "Access denied" });

    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * Number(limit);

    const posts = await PostModel.find({ "comments.0": { $exists: true } })
      .populate("comments.user", "firstName lastName email")
      .select("title slug comments");

    let allComments = [];
    for (const post of posts) {
      for (const comment of post.comments) {
        allComments.push({
          postId: post._id, postTitle: post.title, postSlug: post.slug,
          comment: { _id: comment._id, text: comment.text, editedAt: comment.editedAt, createdAt: comment.createdAt },
          commenter: comment.user ? { _id: comment.user._id, firstName: comment.user.firstName, lastName: comment.user.lastName, email: comment.user.email } : null,
        });
      }
    }

    allComments.sort((a, b) => new Date(b.comment.createdAt) - new Date(a.comment.createdAt));

    if (search) {
      const term = search.toLowerCase();
      allComments = allComments.filter((item) =>
        item.comment.text?.toLowerCase().includes(term) ||
        item.commenter?.firstName?.toLowerCase().includes(term) ||
        item.commenter?.lastName?.toLowerCase().includes(term)
      );
    }

    const total = allComments.length;
    const paginated = allComments.slice(skip, skip + Number(limit));

    res.status(200).send({ message: "Comments fetched successfully", total, page: Number(page), totalPages: Math.ceil(total / Number(limit)), data: paginated });
  } catch (error) {
    console.log("ADMIN GET ALL COMMENTS ERROR:", error.message);
    res.status(500).send({ message: "Failed to fetch comments", error: error.message });
  }
};

// =====================
// ADMIN DELETE COMMENT
// =====================
const adminDeleteComment = async (req, res) => {
  try {
    if (req.user.roles !== "admin") return res.status(403).send({ message: "Access denied" });

    const { slug, commentId } = req.params;

    const post = await PostModel.findOne({ slug });
    if (!post) return res.status(404).send({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).send({ message: "Comment not found" });

    comment.deleteOne();
    await post.save();

    res.status(200).send({ message: "Comment deleted successfully" });
  } catch (error) {
    console.log("ADMIN DELETE COMMENT ERROR:", error.message);
    res.status(500).send({ message: "Failed to delete comment" });
  }
};

module.exports = {
  createPost, getAllPosts, getSinglePost, updatePost, deletePost,
  approvePost, previewPost, rejectPost, getPendingPosts,
  likePost, sharePost, addComment, deleteComment, editComment,
  searchPosts, getTrendingPosts, getMyPosts,
  getAdminStats, adminGetAllPosts, adminDeletePost, adminGetAllComments, adminDeleteComment,
};