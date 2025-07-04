// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
//Used to parse through form data and JSON bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//communication with the frontend and backend
app.use(cors());



//Our database connection
const pool = new Pool({
  user: 'postgres',          
  host: 'localhost',        
  database: 'csProject',          
  password: 'ShzT8gh6',  
  port: 5432,                
});

const multer = require('multer');

//multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads')); // Make sure the folder exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});


const upload = multer({ storage: storage });
const bcrypt = require('bcrypt');

//track logged in user
const session = require('express-session');
app.use(session({
  secret: '120c7d9700d6a6cdd8995cfa9d76928d559f99dd3bac352b127a08ef65014141', 
  resave: false,
  saveUninitialized: true
}));



// signup POST request
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Password hashed
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database with the hashed password
    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email, hashedPassword]
    );

    res.json({ success: true, message: 'Signup successful!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Signup failed.' });
  }
});

// login POST request
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Get the user by email
    const result = await pool.query(
      'SELECT * FROM users WHERE email=$1',
      [email]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      // Compare the hashed password
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        req.session.userId = user.id; // Save user ID in session
        return res.json({ success: true, message: 'Login successful!' });
      }else {
        res.json({ success: false, message: 'Invalid login' });
      }
    } else {
      res.json({ success: false, message: 'Invalid login' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});


// Handle report submissions
app.post('/report', upload.single('photo'), async (req, res) => {
  const { address, description } = req.body;
  const photo_url = req.file ? '/uploads/' + req.file.filename : null;

  try {
    await pool.query(
      'INSERT INTO reports (photo_url, address, description) VALUES ($1, $2, $3)',
      [photo_url, address, description]
    );
    res.json({ success: true, message: 'Report submitted!' });
  } catch (err) {
    console.error(err); // <-- Check this output
    res.status(500).json({ success: false, message: 'Failed to submit report.' });
  }
});

//handles event creation
app.post('/create-event', upload.single('eventImage'), async (req, res) => {
  const { eventName, eventDate, eventTime, eventLocation } = req.body;
  const eventImageUrl = req.file ? '/uploads/' + req.file.filename : null;
  const userId = req.session.userId; // Get user ID from session

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  try {
    await pool.query(
      'INSERT INTO events (event_name, event_date, event_time, event_location, event_image_url, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [eventName, eventDate, eventTime, eventLocation, eventImageUrl, userId]
    );
    res.redirect('/event.html');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to create event.');
  }
});

// API endpoint to get events with pagination
app.get('/api/events', async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await pool.query(
      `SELECT events.id, event_name, event_date, event_time, event_location, event_image_url, users.email AS user_email, events.number_participating AS user_email
       FROM events
       JOIN users ON events.user_id = users.id
       ORDER BY events.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch events.' });
  }
});

// User joins an event
app.post('/api/events/:id/join', async (req, res) => {
  const userId = req.session.userId;
  const eventId = parseInt(req.params.id, 10);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  try {
    // Try to insert participation
    const result = await pool.query(
      'INSERT INTO participating (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
      [eventId, userId]
    );
    // Only increment if a new row was inserted
    if (result.rowCount > 0) {
      await pool.query(
        'UPDATE events SET number_participating = number_participating + 1 WHERE id = $1',
        [eventId]
      );
      res.json({ success: true, message: 'Joined event!' });
    } else {
      res.json({ success: false, message: 'You have already joined this event.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to join event.' });
  }
});

app.get('/api/events/:id/participants', async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  try {
    const result = await pool.query(
      `SELECT users.email
       FROM participating
       JOIN users ON participating.user_id = users.id
       WHERE participating.event_id = $1`,
      [eventId]
    );
    res.json(result.rows.map(row => row.email));
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch participants.' });
  }
});

//The directory that has server.js
app.use(express.static(__dirname));
// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
