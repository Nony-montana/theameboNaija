const PostModel = require("../models/post.model");

// =====================
// HELPER FUNCTION
// =====================
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

// =====================
// CREATE A POST
// =====================
const createPost = async (req, res) => {
  const { title, content, category, tags, status } = req.body;

  try {
    const slug = generateSlug(title);

    // Check if a post with the same slug already exists
    const existingPost = await PostModel.findOne({ slug });
    if (existingPost) {
      return res.status(400).send({
        message:
          "A post with this title already exists, please use a different title",
      });
    }

    // If an image was uploaded, Cloudinary gives us the URL via req.file
    const image = req.file ? req.file.path : "";

    const post = await PostModel.create({
      title,
      slug,
      content,
      image,
      category,
      tags,
      status: status || "draft", // default to draft if not provided
      author: req.user.id,
      // isApproved defaults to false, so post won't show until admin approves
    });

    res.status(201).send({
      message: "Post created successfully",
      data: post,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Failed to create post",
    });
  }
};

// =====================
// GET ALL PUBLISHED & APPROVED POSTS
// =====================
const getAllPosts = async (req, res) => {
  try {
    const { category, tag, page = 1, limit = 10 } = req.query;

    // Only show posts that are published AND approved by admin
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
    res.status(500).send({
      message: "Failed to fetch posts",
    });
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
      return res.status(404).send({
        message: "Post not found",
      });
    }

    // Increase view count by 1 every time someone opens the post
    post.views += 1;
    await post.save();

    res.status(200).send({
      message: "Post fetched successfully",
      data: post,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Failed to fetch post",
    });
  }
};

// =====================
// UPDATE / EDIT A POST
// =====================
const updatePost = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await PostModel.findOne({ slug });

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    // Only the author or an admin can edit
    if (post.author.toString() !== req.user.id && req.user.roles !== "admin") {
      return res.status(403).send({
        message: "You are not allowed to edit this post",
      });
    }

    // If a new image was uploaded, use the new Cloudinary URL
    if (req.file) {
      req.body.image = req.file.path;
    }

    // If title is being changed, regenerate the slug
    if (req.body.title) {
      req.body.slug = generateSlug(req.body.title);
    }

    // If post is edited, reset approval so admin can review again
    req.body.isApproved = false;
    req.body.approvedBy = null;
    req.body.approvedAt = null;
    req.body.status = "pending";

    const updatedPost = await PostModel.findOneAndUpdate({ slug }, req.body, {
      returnDocument: "after",
      runValidators: true,
    });

    res.status(200).send({
      message:
        "Post updated successfully, it will be reviewed by an admin before publishing",
      data: updatedPost,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Failed to update post",
    });
  }
};

// =====================
// DELETE A POST
// =====================
const deletePost = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await PostModel.findOne({ slug });

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    // Only the author or an admin can delete
    if (post.author.toString() !== req.user.id && req.user.roles !== "admin") {
      return res.status(403).send({
        message: "You are not allowed to delete this post",
      });
    }

    await PostModel.findOneAndDelete({ slug });

    res.status(200).send({
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Failed to delete post",
    });
  }
};

// =====================
// APPROVE A POST (admin only)
// =====================
const approvePost = async (req, res) => {
  try {
    const { slug } = req.params;

    // Only admins can approve
    if (req.user.roles !== "admin") {
      return res.status(403).send({
        message: "Only admins can approve posts",
      });
    }

    const post = await PostModel.findOneAndUpdate(
      { slug },
      {
        isApproved: true,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        status: "published",
      },
      { new: true },
    );

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
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
      return res.status(403).send({
        message: "Only admins can reject posts",
      });
    }

    const post = await PostModel.findOneAndUpdate(
      { slug },
      { status: "rejected", isApproved: false },
      { new: true },
    );

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    res.status(200).send({
      message: "Post rejected",
      data: post,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to reject post" });
  }
};

// =====================
// GET ALL PENDING POSTS (admin only)
// =====================
const getPendingPosts = async (req, res) => {
  try {
    if (req.user.roles !== "admin") {
      return res.status(403).send({
        message: "Only admins can view pending posts",
      });
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

    const post = await PostModel.findOne({ slug });

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userId);
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

    // Increase share count by 1
    post.shares += 1;
    await post.save();

    res.status(200).send({
      message: "Post shared successfully",
      totalShares: post.shares,
    });
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

    const post = await PostModel.findOne({ slug });

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    post.comments.push({
      user: req.user.id,
      text,
    });

    await post.save();

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

    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    const comment = post.comments.id(commentId);

    if (!comment) {
      return res.status(404).send({ message: "Comment not found" });
    }

    // Only the comment owner or an admin can delete a comment
    if (comment.user.toString() !== req.user.id && req.user.roles !== "admin") {
      return res
        .status(403)
        .send({ message: "You are not allowed to delete this comment" });
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
// SEARCH POSTS
// =====================
const searchPosts = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).send({ message: "Please provide a search term" });
    }

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

    res.status(200).send({
      message: "Search results",
      total: posts.length,
      data: posts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Search failed" });
  }
};

// GET MY POSTS (logged in user's posts)
const getMyPosts = async (req, res) => {
  try {
    const posts = await PostModel.find({ author: req.user.id }).sort({
      createdAt: -1,
    });

    if (posts.length === 0) {
      return res.status(404).send({
        message: "You have not created any posts yet",
      });
    }

    res.status(200).send({
      message: "Your posts fetched successfully",
      total: posts.length,
      data: posts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch your posts" });
  }
};

// =====================
// GET TRENDING POSTS (most viewed)
// =====================
const getTrendingPosts = async (req, res) => {
  try {
    const posts = await PostModel.find({
      status: "published",
      isApproved: true,
    })
      .populate("author", "firstName lastName")
      .sort({ views: -1 })
      .limit(10);

    res.status(200).send({
      message: "Trending posts fetched successfully",
      data: posts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to fetch trending posts" });
  }
};

module.exports = {
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
};
