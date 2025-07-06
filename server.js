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
        req.session.isAdmin = user.is_admin; // Save admin flag in session

        // Respond with admin info
        if (user.is_admin) {
          return res.json({ success: true, isAdmin: true, redirect: 'admin.html' });
        } else {
          return res.json({ success: true, isAdmin: false, redirect: 'index.html' });
        }
      } else {
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

app.get('/api/admin/events', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        events.id,
        events.event_name, 
        events.event_date, 
        events.event_location,
        COUNT(participating.id) AS volunteers
      FROM events
      LEFT JOIN participating ON events.id = participating.event_id
      GROUP BY events.id, events.event_name, events.event_date, events.event_location
      ORDER BY events.event_date DESC
    `);
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
app.get('/api/admin/stats', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    const upcomingResult = await pool.query('SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE');
    const reportsResult = await pool.query('SELECT COUNT(*) FROM reports');
    const completedResult = await pool.query('SELECT COUNT(*) FROM events WHERE event_date < CURRENT_DATE');

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count, 10),
      upcomingEvents: parseInt(upcomingResult.rows[0].count, 10),
      reports: parseInt(reportsResult.rows[0].count, 10),
      completedEvents: parseInt(completedResult.rows[0].count, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

app.get('/api/admin/reports', async (req, res) => {
  console.log('GET /api/admin/reports called');
  try {
    const result = await pool.query('SELECT id, photo_url, address, description FROM reports ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch reports.' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT email FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

app.get('/api/user/profile', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Not logged in' });

    // Get user email
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = userResult.rows[0]?.email;

    // Get events created by user
    const createdEventsResult = await pool.query(
      'SELECT event_name, event_date FROM events WHERE user_id = $1 ORDER BY event_date DESC',
      [userId]
    );

    // Get joined events (upcoming)
    const joinedUpcomingResult = await pool.query(
      `SELECT e.event_name, e.event_date
       FROM participating p
       JOIN events e ON p.event_id = e.id
       WHERE p.user_id = $1 AND e.event_date >= CURRENT_DATE
       ORDER BY e.event_date ASC`,
      [userId]
    );

    // Get joined events (completed)
    const joinedCompletedResult = await pool.query(
      `SELECT e.event_name, e.event_date
       FROM participating p
       JOIN events e ON p.event_id = e.id
       WHERE p.user_id = $1 AND e.event_date < CURRENT_DATE
       ORDER BY e.event_date DESC`,
      [userId]
    );

    res.json({
      email,
      createdEvents: createdEventsResult.rows,
      joinedUpcoming: joinedUpcomingResult.rows,
      joinedCompleted: joinedCompletedResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
});

app.get('/api/admin/user-profile', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  try {
    // Get user id by email
    const userResult = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const userId = userResult.rows[0].id;

    // Get events created by user
    const createdEventsResult = await pool.query(
      'SELECT event_name, event_date FROM events WHERE user_id = $1 ORDER BY event_date DESC',
      [userId]
    );

    // Get joined events (upcoming)
    const joinedUpcomingResult = await pool.query(
      `SELECT e.event_name, e.event_date
       FROM participating p
       JOIN events e ON p.event_id = e.id
       WHERE p.user_id = $1 AND e.event_date >= CURRENT_DATE
       ORDER BY e.event_date ASC`,
      [userId]
    );

    // Get joined events (completed)
    const joinedCompletedResult = await pool.query(
      `SELECT e.event_name, e.event_date
       FROM participating p
       JOIN events e ON p.event_id = e.id
       WHERE p.user_id = $1 AND e.event_date < CURRENT_DATE
       ORDER BY e.event_date DESC`,
      [userId]
    );

    res.json({
      email,
      createdEvents: createdEventsResult.rows,
      joinedUpcoming: joinedUpcomingResult.rows,
      joinedCompleted: joinedCompletedResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
});

//The directory that has server.js
app.use(express.static(__dirname));
// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
