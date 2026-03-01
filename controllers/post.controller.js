const { cloudinary } = require("../config/cloudinary");
const PostModel = require("../models/post.model");
const UserModel = require("../models/user.model");

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
    const { title, content, category, status, tags, image } = req.body;

    try {
        const slug = generateSlug(title);

        const existingPost = await PostModel.findOne({ slug });
        if (existingPost) {
            return res.status(400).send({
                message: "A post with this title already exists"
            });
        }

        // Upload base64 image to Cloudinary if provided
        let imageUrl = "";
        if (image && image.startsWith("data:image")) {
            const uploadResult = await cloudinary.uploader.upload(image, {
                folder: "blog-images",
                transformation: [{ width: 1200, quality: "auto" }]
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
            author: req.user.id
        });

        res.status(201).send({
            message: "Post created successfully",
            data: post
        });

    } catch (error) {
        console.log("CREATE POST ERROR:", error.message);
        res.status(500).send({
            message: "Failed to create post",
            error: error.message
        });
    }
};// =====================
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
        const { title, status } = req.body;

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

        // Build a controlled update object instead of spreading req.body directly.
        // Spreading req.body is dangerous — it allows clients to overwrite any field
        // on the document (e.g. author, isApproved, roles) by simply sending it in the request.
        const updateData = {
            title: title || post.title,
            content: req.body.content || post.content,
            category: req.body.category || post.category,
            // FIX: Respect the status the user chose (draft or pending).
            // Previously this was hardcoded to "pending", ignoring the user's choice to save as draft.
            status: status === "draft" ? "draft" : "pending",
        };

        // FIX: Parse tags sent as a JSON string from the frontend FormData.
        // Previously used repeated tags[] keys which are unreliable across multer configs.
        if (req.body.tags) {
            try {
                updateData.tags = JSON.parse(req.body.tags);
            } catch {
                // Fallback: if someone sends a plain comma-separated string
                updateData.tags = req.body.tags.split(",").map((t) => t.trim()).filter(Boolean);
            }
        }

        // CloudinaryStorage (in config/cloudinary.js) uploads the image automatically
        // before the request even reaches this controller. The resulting Cloudinary
        // URL is stored in req.file.path — no manual upload call needed.
        if (req.file) {
            updateData.image = req.file.path;
        }

        // FIX: Only regenerate slug when the title actually changes.
        // Previously it regenerated the slug on every edit even if the title was unchanged,
        // and always set it from title even if the title wasn't sent.
        if (title && title !== post.title) {
            updateData.slug = generateSlug(title);
        }

        // Reset approval fields so admin can re-review the updated post.
        // Only do this when the user is actually submitting for review, not saving a draft.
        if (updateData.status === "pending") {
            updateData.isApproved = false;
            updateData.approvedBy = null;
            updateData.approvedAt = null;
        }

        // FIX: Query by _id instead of slug, since slug may have just changed above.
        // Using the old slug to query after it has been updated would still work here
        // (findOneAndUpdate is atomic), but using _id is clearer and safer.
        const updatedPost = await PostModel.findByIdAndUpdate(
            post._id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).send({
            message: "Post updated successfully, it will be reviewed by an admin before publishing",
            data: updatedPost,
        });

    } catch (error) {
        console.log("UPDATE POST ERROR:", error.message);
        res.status(500).send({
            message: "Failed to update post",
            error: error.message,
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

// ADMIN PREVIEW - can see any post regardless of status
const previewPost = async (req, res) => {
    try {
        const { slug } = req.params;

        const post = await PostModel.findOne({ slug })
            .populate("author", "firstName lastName")
            .populate("comments.user", "firstName lastName");

        if (!post) {
            return res.status(404).send({ message: "Post not found" });
        }

        // Allow access if the requester is admin OR the post's own author
        const isAdmin = req.user.roles === "admin";
        const isAuthor = post.author._id.toString() === req.user.id;

        if (!isAdmin && !isAuthor) {
            return res.status(403).send({ message: "You are not allowed to preview this post" });
        }

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
// EDIT A COMMENT
// PUT /api/v1/posts/:slug/comment/:commentId
// =====================
const editComment = async (req, res) => {
    try {
        const { slug, commentId } = req.params;
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).send({ message: "Comment text is required" });
        }

        const post = await PostModel.findOne({ slug });

        if (!post) {
            return res.status(404).send({ message: "Post not found" });
        }

        const comment = post.comments.id(commentId);

        if (!comment) {
            return res.status(404).send({ message: "Comment not found" });
        }

        // Only the comment owner or an admin can edit
        if (comment.user.toString() !== req.user.id ) {
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
// DELETE A POST (author or admin)
// DELETE /api/v1/posts/:slug
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

// =====================
// GET ADMIN STATS
// GET /api/v1/admin/stats
// Admin only
// =====================
const getAdminStats = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        // Run all queries in parallel for speed
        const [
            totalPosts,
            totalUsers,
            totalComments,
            pendingPosts,
            publishedPosts,
            draftPosts,
            rejectedPosts,
            categoryBreakdown,
            recentPosts,
            recentUsers,
        ] = await Promise.all([
            // Total counts
            PostModel.countDocuments(),
            UserModel.countDocuments(),
            PostModel.aggregate([{ $project: { commentCount: { $size: "$comments" } } }, { $group: { _id: null, total: { $sum: "$commentCount" } } }]),
            PostModel.countDocuments({ status: "pending" }),
            PostModel.countDocuments({ status: "published" }),
            PostModel.countDocuments({ status: "draft" }),
            PostModel.countDocuments({ status: "rejected" }),

            // Posts per category
            PostModel.aggregate([
                { $group: { _id: "$category", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),

            // 5 most recent posts
            PostModel.find()
                .populate("author", "firstName lastName")
                .sort({ createdAt: -1 })
                .limit(5)
                .select("title status category createdAt author"),

            // 5 most recent users
            UserModel.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select("firstName lastName email roles createdAt"),
        ]);

        res.status(200).send({
            message: "Admin stats fetched successfully",
            data: {
                totals: {
                    posts: totalPosts,
                    users: totalUsers,
                    comments: totalComments[0]?.total || 0,
                    pending: pendingPosts,
                    published: publishedPosts,
                    drafts: draftPosts,
                    rejected: rejectedPosts,
                },
                categoryBreakdown,
                recentPosts,
                recentUsers,
            },
        });

    } catch (error) {
        console.log("ADMIN STATS ERROR:", error.message);
        res.status(500).send({ message: "Failed to fetch admin stats" });
    }
};

// =====================
// GET ALL POSTS (admin)
// GET /api/v1/admin/posts
// =====================
const adminGetAllPosts = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        const { page = 1, limit = 15, search, category, status } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};
        if (search)   filter.title    = { $regex: search, $options: "i" };
        if (category) filter.category = category;
        if (status)   filter.status   = status;

        const [posts, total] = await Promise.all([
            PostModel.find(filter)
                .populate("author", "firstName lastName email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("title category status views likes comments shares createdAt author slug image"),
            PostModel.countDocuments(filter),
        ]);

        res.status(200).send({
            message: "Posts fetched successfully",
            total,
            page: Number(page),
            totalPages: Math.ceil(total / limit),
            data: posts,
        });

    } catch (error) {
        console.log("ADMIN GET ALL POSTS ERROR:", error.message);
        res.status(500).send({ message: "Failed to fetch posts" });
    }
};

// =====================
// ADMIN DELETE POST
// DELETE /api/v1/admin/posts/:slug
// =====================
const adminDeletePost = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

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
// GET ALL COMMENTS (admin)
// GET /api/v1/admin/comments
// =====================
const adminGetAllComments = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

        const { page = 1, limit = 20, search } = req.query;
        const skip = (page - 1) * limit;

        // Use aggregation to flatten comments out of posts
        const pipeline = [
            { $unwind: "$comments" },

            // Populate comment user info
            {
                $lookup: {
                    from: "users",
                    localField: "comments.user",
                    foreignField: "_id",
                    as: "commentUser"
                }
            },
            { $unwind: { path: "$commentUser", preserveNullAndEmpty: true } },

            // Search by comment text or commenter name
            ...(search ? [{
                $match: {
                    $or: [
                        { "comments.text": { $regex: search, $options: "i" } },
                        { "commentUser.firstName": { $regex: search, $options: "i" } },
                        { "commentUser.lastName": { $regex: search, $options: "i" } },
                    ]
                }
            }] : []),

            { $sort: { "comments.createdAt": -1 } },

            // Get total count before pagination
            {
                $facet: {
                    total: [{ $count: "count" }],
                    data: [
                        { $skip: skip },
                        { $limit: Number(limit) },
                        {
                            $project: {
                                _id: 0,
                                postId: "$_id",
                                postTitle: "$title",
                                postSlug: "$slug",
                                comment: "$comments",
                                commenter: {
                                    _id: "$commentUser._id",
                                    firstName: "$commentUser.firstName",
                                    lastName: "$commentUser.lastName",
                                    email: "$commentUser.email",
                                }
                            }
                        }
                    ]
                }
            }
        ];

        const result = await PostModel.aggregate(pipeline);
        const total = result[0]?.total[0]?.count || 0;
        const comments = result[0]?.data || [];

        res.status(200).send({
            message: "Comments fetched successfully",
            total,
            page: Number(page),
            totalPages: Math.ceil(total / limit),
            data: comments,
        });

    } catch (error) {
        console.log("ADMIN GET ALL COMMENTS ERROR:", error.message);
        res.status(500).send({ message: "Failed to fetch comments" });
    }
};

// =====================
// ADMIN DELETE COMMENT
// DELETE /api/v1/admin/posts/:slug/comment/:commentId
// =====================
const adminDeleteComment = async (req, res) => {
    try {
        if (req.user.roles !== "admin") {
            return res.status(403).send({ message: "Access denied" });
        }

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
  createPost,
  getAllPosts,
  getSinglePost,
  updatePost,
  deletePost,
  approvePost,
  previewPost,
  rejectPost,
  getPendingPosts,
  likePost,
  sharePost,
  addComment,
  deleteComment,
  editComment,
  searchPosts,
  getTrendingPosts,
  getMyPosts,
  getAdminStats,
  adminGetAllPosts,
  adminDeletePost,
  adminGetAllComments,
  adminDeleteComment
};
