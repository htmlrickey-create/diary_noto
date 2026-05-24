const express = require("express");
const multer = require("multer");
const path = require("path");
const mysql = require("mysql2");
const session = require("express-session");
const bcrypt = require("bcrypt");
const MySQLStore = require("express-mysql-session")(session);

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// 静的ファイル
// =======================
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// multer
// =======================
const upload = multer({
    dest: path.join(__dirname, "uploads/")
});

// =======================
// DB（Render対応）
// =======================
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    createDatabaseTable: true
});

db.connect(err => {
    if (err) console.log("DB接続エラー", err);
    else console.log("MySQL接続成功");
});

// =======================
// session（Render対応）
// =======================
app.set("trust proxy", 1);

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: "none",
        secure: true
    }
}));

// =======================
// 新規登録
// =======================
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "入力不足" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, hashedPassword],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "登録失敗", err });
            }
            res.json({ message: "登録成功" });
        }
    );
});

// =======================
// ログイン
// ★ここ修正済み（userId統一）
// =======================
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (err, results) => {
            if (err) return res.status(500).json({ message: "エラー" });

            if (results.length === 0) {
                return res.status(401).json({ message: "ユーザーがいない" });
            }

            const user = results[0];

            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ message: "パスワード違う" });
            }

            // ★修正ここ
            req.session.userId = user.id;
            req.session.username = user.username;

            res.json({
                message: "ログイン成功",
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        }
    );
});

// =======================
// ログイン確認
// =======================
app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ loggedIn: false });
    }

    res.json({
        loggedIn: true,
        user: {
            id: req.session.userId,
            username: req.session.username
        }
    });
});


app.get("/api/mypage", isLogin, (req, res) => {

    const userId = req.session.userId;

    // ユーザー情報
    db.query(
        "SELECT id, username, email FROM users WHERE id = ?",
        [userId],
        (err, userRows) => {

            if (err) return res.status(500).json({ error: "user error" });

            const user = userRows[0];

            // 投稿数
            db.query(
                "SELECT COUNT(*) AS postCount FROM diaries WHERE user_id = ?",
                [userId],
                (err, postRows) => {

                    if (err) return res.status(500).json({ error: "post error" });

                    // フレンド数
                    db.query(
                        `
                        SELECT COUNT(*) AS friendCount
                        FROM friendships
                        WHERE user_id = ?
                        `,
                        [userId],
                        (err, friendRows) => {

                            if (err) return res.status(500).json({ error: "friend error" });

                            // 投稿一覧
                            db.query(
                                "SELECT * FROM diaries WHERE user_id = ? ORDER BY id DESC",
                                [userId],
                                (err, diaryRows) => {

                                    if (err) return res.status(500).json({ error: "diary error" });

                                    res.json({
                                        user,
                                        postCount: postRows[0].postCount,
                                        friendCount: friendRows[0].friendCount,
                                        diaries: diaryRows
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

app.post("/api/profile", isLogin, (req, res) => {

    const { username, email } = req.body;

    db.query(
        "UPDATE users SET username = ?, email = ? WHERE id = ?",
        [username, email, req.session.userId],
        (err) => {

            if (err) return res.status(500).json({ message: "更新失敗" });

            // セッション更新
            req.session.username = username;

            res.json({ message: "更新成功" });
        }
    );
});
// =======================
// ログアウト
// =======================
app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ message: "ログアウト完了" });
    });
});

// =======================
// ログインチェック
// =======================
function isLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "ログインしてください" });
    }
    next();
}

// =======================
// 投稿（テーブル名修正済み）
// =======================
app.post("/api/diary", isLogin, upload.single("image"), (req, res) => {

    const sql = `
        INSERT INTO diaries (title, content, date, image, user_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        req.body.title,
        req.body.content,
        req.body.date,
        req.file ? req.file.filename : null,
        req.session.userId
    ], (err, result) => {

        if (err) return res.status(500).json({ error: "DBエラー" });

        res.json({
            message: "保存成功",
            id: result.insertId
        });
    });
});

// =======================
// 自分の日記
// =======================
app.get("/api/diary", isLogin, (req, res) => {

    db.query(
        "SELECT * FROM diaries WHERE user_id = ? ORDER BY id DESC",
        [req.session.userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: "取得失敗" });
            res.json(result);
        }
    );
});

// =======================
// 友達＋自分の日記
// =======================
app.get("/api/friends-diary", isLogin, (req, res) => {

    const sql = `
        SELECT d.*
        FROM diaries d
        WHERE d.user_id = ?
        OR d.user_id IN (
            SELECT friend_id FROM friendships WHERE user_id = ?
            UNION
            SELECT user_id FROM friendships WHERE friend_id = ?
        )
        ORDER BY d.id DESC
    `;

    db.query(sql,
        [req.session.userId, req.session.userId, req.session.userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: "取得失敗" });
            res.json(result);
        }
    );
});

// =======================
// フレンド申請
// =======================
app.post("/api/friend", isLogin, (req, res) => {

    const { friendId } = req.body;

    if (req.session.userId == friendId) {
        return res.json({ error: "自分には送れません" });
    }

    const checkSql = `
        SELECT * FROM friend_requests
        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `;

    db.query(checkSql, [req.session.userId, friendId], (err, rows) => {

        if (err) return res.status(500).json({ error: "申請失敗" });

        if (rows.length > 0) {
            return res.json({ error: "すでに申請済みです" });
        }

        const insertSql = `
            INSERT INTO friend_requests (sender_id, receiver_id)
            VALUES (?, ?)
        `;

        db.query(insertSql, [req.session.userId, friendId], () => {
            res.json({ message: "フレンド申請送信" });
        });
    });
});

// =======================
// 申請一覧
// =======================
app.get("/api/friend/request", isLogin, (req, res) => {

    const sql = `
        SELECT fr.id, fr.sender_id, u.username
        FROM friend_requests fr
        JOIN users u ON u.id = fr.sender_id
        WHERE fr.receiver_id = ? AND fr.status = 'pending'
    `;

    db.query(sql, [req.session.userId], (err, result) => {
        if (err) return res.status(500).json({ error: "取得失敗" });
        res.json(result);
    });
});

// =======================
// フレンド承認
// =======================
app.post("/api/friend/accept", isLogin, (req, res) => {

    const { requestId, senderId } = req.body;

    const updateSql = `
        UPDATE friend_requests
        SET status = 'accepted'
        WHERE id = ?
    `;

    db.query(updateSql, [requestId], (err) => {

        if (err) return res.status(500).json({ error: "承認失敗" });

        const friendSql = `
            INSERT INTO friendships (user_id, friend_id)
            VALUES (?, ?)
        `;

        db.query(friendSql, [req.session.userId, senderId]);
        db.query(friendSql, [senderId, req.session.userId]);

        res.json({ message: "友達追加成功" });
    });
});

//日記の削除API
app.delete("/api/diary/:id", isLogin, (req, res) => {

    const id = req.params.id;

    db.query(
        "DELETE FROM diaries WHERE id = ? AND user_id = ?",
        [id, req.session.userId],
        (err) => {
            if (err) return res.status(500).json({ error: "削除失敗" });

            res.json({ message: "削除成功" });
        }
    );
});
// =======================
// いいね
// =======================
app.post("/api/like", isLogin, (req, res) => {

    const userId = req.session.userId;
    const { postId } = req.body;

    const checkSql = `
        SELECT * FROM likes
        WHERE user_id = ? AND post_id = ?
    `;

    db.query(checkSql, [userId, postId], (err, rows) => {

        if (err) return res.status(500).json({ error: "server error" });

        if (rows.length > 0) {

            db.query(
                "DELETE FROM likes WHERE user_id = ? AND post_id = ?",
                [userId, postId],
                () => res.json({ liked: false })
            );

        } else {

            db.query(
                "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
                [userId, postId],
                () => res.json({ liked: true })
            );
        }
    });
});

// =======================
// いいね数
// =======================
app.get("/api/likes/:postId", (req, res) => {

    db.query(
        "SELECT COUNT(*) AS count FROM likes WHERE post_id = ?",
        [req.params.postId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "取得失敗" });
            res.json({ count: rows[0].count });
        }
    );
});

// =======================
// 起動
// =======================
app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});