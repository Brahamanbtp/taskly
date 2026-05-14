const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback",
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    const client = await pool.connect();
    try {
      const email = profile.emails[0].value;
      const googleId = profile.id;

      // 1. Check if user exists by google_id
      const res1 = await client.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
      if (res1.rowCount > 0) return done(null, res1.rows[0]);

      // 2. Check if user exists by email (link account)
      const res2 = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      if (res2.rowCount > 0) {
        const updated = await client.query('UPDATE users SET google_id = $1 WHERE email = $2 RETURNING *', [googleId, email]);
        return done(null, updated.rows[0]);
      }

      // 3. Create new user
      const newUser = await client.query(
        'INSERT INTO users (id, email, google_id) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), email, googleId]
      );
      return done(null, newUser.rows[0]);
    } catch (err) {
      return done(err);
    } finally {
      client.release();
    }
  }));
}

module.exports = passport;
