require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');

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

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ====================== GOOGLE LOGIN ======================
app.post('/auth/google', async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const {
      sub: googleId,
      email,
      name: fullName,
      given_name: firstName,
      family_name: lastName,
      picture,
    } = payload;

    const existingUser = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );

    let user;
    if (existingUser.rows.length > 0) {
      // ✏️ Zaktualizuj dane użytkownika przy ponownym logowaniu
      const update = await pool.query(
        `UPDATE users SET 
          email = $1, 
          full_name = $2, 
          first_name = $3, 
          last_name = $4, 
          picture = $5 
         WHERE google_id = $6
         RETURNING *`,
        [email, fullName, firstName, lastName, picture, googleId]
      );
      user = update.rows[0];
    } else {
      // 🆕 Nowy użytkownik
      const insert = await pool.query(
        `INSERT INTO users 
          (google_id, email, full_name, first_name, last_name, picture)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [googleId, email, fullName, firstName, lastName, picture]
      );
      user = insert.rows[0];
    }

    res.json({ user });
  } catch (error) {
    console.error('Błąd podczas logowania Google:', error);
    res.status(401).json({ error: 'Nieprawidłowy token Google' });
  }
});

// ====================== LOKALIZACJE ======================
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

// ====================== START SERWERA ======================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serwer działa na porcie ${port}`);
});


app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, status, last_seen FROM users ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Błąd pobierania użytkowników:', error);
    res.status(500).json({ error: 'Błąd pobierania użytkowników' });
  }
});

app.post('/api/user/status', async (req, res) => {
  const { google_id, status } = req.body;

  if (!google_id || !status) {
    return res.status(400).json({ error: 'Brak wymaganych danych' });
  }

  try {
    await pool.query(
      `UPDATE users 
       SET status = $1, last_seen = NOW() 
       WHERE google_id = $2`,
      [status, google_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Błąd aktualizacji statusu:', err);
    res.status(500).json({ error: 'Błąd aktualizacji statusu' });
  }
});
