require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.SSL_CA,
  },
});
app.post('/api/locations', async (req, res) => {
  const { name, latitude, longitude } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO locations (name, latitude, longitude) VALUES ($1, $2, $3) RETURNING *',
      [name, latitude, longitude]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd zapisu do bazy' });
  }
});
app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd odczytu z bazy' });
  }
});

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.post('/auth/google', async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const existingUser = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );

    let user;
    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
    } else {
      const insertResult = await pool.query(
        'INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4) RETURNING *',
        [googleId, email, name, picture]
      );
      user = insertResult.rows[0];
    }

    res.json({ user });
  } catch (error) {
    console.error('Błąd podczas logowania Google:', error);
    res.status(401).json({ error: 'Nieprawidłowy token Google' });
  }
});
