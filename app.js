const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server has been started and running on port 3000.........");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//MiddleWare function to Verify the authenticated user
const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "apashyampamkirikiri", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        res.status(200);
        next();
      }
    });
  }
};

const getUserId = async (req, res, next) => {
  const { username } = req;
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
  const getUser = await db.get(getUserQuery);
  req.userId = getUser.user_id;
  next();
};

//API to Register a New User
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const checkUserQuery = `
        SELECT * FROM user WHERE username = '${username}'
    `;
  const getUser = await db.get(checkUserQuery);
  if (getUser !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else if (password.length <= 6) {
    res.status(400);
    res.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createUserQuery = `
        INSERT INTO user (name, username, password, gender)
        VALUES(
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
        )
    `;
    await db.run(createUserQuery);
    res.send("User created successfully");
  }
});

//API to Login User
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const getUserQuery = `
        SELECT * FROM user WHERE username = '${username}'
    `;
  const getUser = await db.get(getUserQuery);
  if (getUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, getUser.password);
    if (!isPasswordCorrect) {
      res.status(400);
      res.send("Invalid password");
    } else {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "apashyampamkirikiri");
      res.status(200);
      res.send({ jwtToken });
    }
  }
});

app.get(
  "/user/tweets/feed/",
  authenticateToken,
  getUserId,
  async (req, res) => {
    const { userId } = req;
    const getTweetFeedDetailsQuery = `
    SELECT 
        user.username AS username, 
        tweet.tweet AS tweet, 
        tweet.date_time AS dateTime
    FROM 
        (user INNER JOIN tweet ON tweet.user_id = user.user_id) AS T 
        INNER JOIN follower
        ON T.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = ${userId}
    ORDER BY dateTime DESC
    LIMIT 4
  `;
    const getTweetFeedData = await db.all(getTweetFeedDetailsQuery);
    res.send(getTweetFeedData);
  }
);

app.get("/user/following/", authenticateToken, getUserId, async (req, res) => {
  const { userId } = req;
  const getFollowingQuery = `
    SELECT 
        name
    FROM
        user INNER JOIN follower ON
            user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId}
  `;
  const getFollowing = await db.all(getFollowingQuery);
  res.send(getFollowing);
});

app.get("/user/followers/", authenticateToken, getUserId, async (req, res) => {
  const { userId } = req;
  const getFollowersQuery = `
        SELECT
            name
        FROM
            user
        INNER JOIN follower
            ON follower.follower_user_id = user.user_id
        WHERE follower.following_user_id = ${userId}
    `;
  const getFollowers = await db.all(getFollowersQuery);
  res.send(getFollowers);
});

app.get("/tweets/:tweetId/", authenticateToken, getUserId, async (req, res) => {
  const { userId } = req;
  const { tweetId } = req.params;
  const checkUserQuery = `
        SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
        WHERE follower.following_user_id = ${userId} AND tweet.tweet_id = ${tweetId}
    `;
  const getUser = await db.get(checkUserQuery);
  if (getUser === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    getTweetQuery = `
        SELECT 
            tweet.tweet as tweet,
            COUNT(DISTINCT like.like_id) as likes,
            COUNT(DISTINCT reply.reply_id) as replies,
            tweet.date_time as dateTime
        FROM (tweet INNER JOIN like 
        ON tweet.tweet_id = like.tweet_id) as T
        INNER JOIN reply ON T.tweet_id = reply.tweet_id
        WHERE tweet.tweet_id = ${tweetId}
        GROUP BY tweet.tweet_id
      `;
    const getTweet = await db.get(getTweetQuery);
    res.send(getTweet);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  getUserId,
  async (req, res) => {
    const { tweetId } = req.params;
    const { userId } = req;
    const checkUserQuery = `
        SELECT * from follower INNER JOIN tweet ON 
        tweet.user_id = follower.following_user_id 
        WHERE follower.follower_user_id = ${userId} 
        AND tweet.tweet_id = ${tweetId}
    `;
    const checkUser = await db.get(checkUserQuery);
    if (checkUser === undefined) {
      res.status(401);
      res.send("Invalid Request");
    } else {
      const getUsersLikes = `
            SELECT user.name as likes
            FROM (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS T
            INNER JOIN user ON user.user_id = T.user_id
            WHERE tweet.tweet_id = ${tweetId}
            GROUP BY tweet.tweet_id
        `;
      const userLikes = await db.all(getUsersLikes);
      const userLikesArray = userLikes.map((each) => each.likes);
      res.send({ likes: userLikesArray });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  getUserId,
  async (req, res) => {
    const { tweetId } = req.params;
    const { userId } = req;
    const checkUserQuery = `
        SELECT * from follower INNER JOIN tweet ON 
        tweet.user_id = follower.following_user_id 
        WHERE follower.follower_user_id = ${userId} 
        AND tweet.tweet_id = ${tweetId}
    `;
    const checkUser = await db.get(checkUserQuery);
    if (checkUser === undefined) {
      res.status(401);
      res.send("Invalid Request");
    } else {
      const getUsersLikes = `
            SELECT user.name as name,
            reply.reply as reply
            FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
            INNER JOIN user ON user.user_id = T.user_id
            WHERE tweet.tweet_id = ${tweetId}
            GROUP BY tweet.tweet_id
        `;
      const userLikes = await db.all(getUsersLikes);
      res.send({ replies: userLikes });
    }
  }
);

app.get("/user/tweets/", authenticateToken, getUserId, async (req, res) => {
  const { userId } = req;
  const getUserTweetsQuery = `
        SELECT tweet.tweet AS tweet,
            COUNT(DISTINCT like.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM (tweet JOIN like ON tweet.tweet_id = like.tweet_id)AS T
        JOIN reply ON reply.tweet_id = T.tweet_id
        WHERE tweet.user_id = ${userId};
        GROUP BY tweet.tweet_id
    `;
  const getUserTweets = await db.all(getUserTweetsQuery);
  res.send(getUserTweets);
});

app.post("/user/tweets/", authenticateToken, getUserId, async (req, res) => {
  const { userId } = req;
  const { tweet } = req.body;
  const createTweetQuery = `
        INSERT INTO tweet(tweet, user_id)
        VALUES('${tweet}', ${userId})
    `;
  const dbResponse = await db.run(createTweetQuery);
  res.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  getUserId,
  async (req, res) => {
    const { tweetId } = req.params;
    const { userId } = req;
    const checkUserQuery = `
        SELECT * FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${userId}
    `;
    const checkUser = await db.get(checkUserQuery);
    if (checkUser === undefined) {
      res.status(401);
      res.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
            DELETE FROM tweet WHERE tweet_id = ${tweetId}
        `;
      const dbResponse = await db.run(deleteTweetQuery);
      res.send("Tweet Removed");
    }
  }
);

module.exports = app;
