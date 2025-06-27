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

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'Brak idToken' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Sprawdź, czy użytkownik już istnieje
    const userResult = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );

    let user;
    if (userResult.rows.length === 0) {
      // Nowy użytkownik – utwórz
      const insertResult = await pool.query(
        'INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4) RETURNING *',
        [googleId, email, name, picture]
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
    }

    res.json({
      message: 'Zalogowano pomyślnie',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    });
  } catch (err) {
    console.error('Błąd logowania przez Google:', err);
    res.status(401).json({ error: 'Token Google jest nieprawidłowy' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});

app.get('/', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT current_database()');
    const schemaResult = await pool.query('SHOW search_path');
    res.send(`
      <h2>API działa! 🔥</h2>
      <p>Baza danych: <strong>${dbResult.rows[0].current_database}</strong></p>
      <p>Search path (schematy): <strong>${schemaResult.rows[0].search_path}</strong></p>
      <p>Użyj np. <a href="/api/locations">/api/locations</a></p>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd podczas pobierania informacji o bazie.');
  }
});

//-----------------------------------------------------------
