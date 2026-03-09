const PostModel = require("../models/post.model");
// =====================
// TOGGLE BOOKMARK
// POST /api/v1/bookmark/:postId
// Protected (verifyUser)


// =====================
const toggleBookmark = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.id;

        const post = await PostModel.findById(postId);
        if (!post) return res.status(404).send({ message: "Post not found" });

        const user = await UserModel.findById(userId);
        if (!user) return res.status(404).send({ message: "User not found" });

        const isBookmarked = user.bookmarks?.includes(postId);

        if (isBookmarked) {
            // Remove bookmark
            user.bookmarks = user.bookmarks.filter(
                (id) => id.toString() !== postId
            );
            await user.save();
            return res.status(200).send({ message: "Bookmark removed", bookmarked: false });
        } else {
            // Add bookmark
            user.bookmarks = user.bookmarks || [];
            user.bookmarks.push(postId);
            await user.save();
            return res.status(200).send({ message: "Post bookmarked", bookmarked: true });
        }
    } catch (error) {
        console.log("TOGGLE BOOKMARK ERROR:", error.message);
        res.status(500).send({ message: "Failed to update bookmark" });
    }
};

// =====================
// GET MY BOOKMARKS
// GET /api/v1/bookmarks
// Protected (verifyUser)
// =====================
const getBookmarks = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id)
            .populate({
                path: "bookmarks",
                match: { status: "published", isApproved: true },
                populate: { path: "author", select: "firstName lastName" },
                options: { sort: { createdAt: -1 } },
            });

        if (!user) return res.status(404).send({ message: "User not found" });

        res.status(200).send({
            message: "Bookmarks fetched successfully",
            total: user.bookmarks?.length || 0,
            data: user.bookmarks || [],
        });
    } catch (error) {
        console.log("GET BOOKMARKS ERROR:", error.message);
        res.status(500).send({ message: "Failed to fetch bookmarks" });
    }
};


module.exports = {  toggleBookmark, getBookmarks };