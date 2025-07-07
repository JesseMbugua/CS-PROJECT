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

app.get('/api/admin/blacklist', async (req, res) => {
  try {
    const result = await pool.query('SELECT email FROM blacklist');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch blacklist.' });
  }
});
// signup POST request
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  const blacklisted = await pool.query('SELECT 1 FROM blacklist WHERE email = $1', [email]);
  if (blacklisted.rows.length > 0) {
  return res.json({ success: false, message: 'This email is banned.' });
}
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
  const blacklisted = await pool.query('SELECT 1 FROM blacklist WHERE email = $1', [email]);
  if (blacklisted.rows.length > 0) {
  return res.json({ success: false, message: 'This account is banned.' });
}

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
  const userId = req.session.userId; // Get user ID from session

  try {
    await pool.query(
      'INSERT INTO reports (photo_url, address, description, user_id) VALUES ($1, $2, $3, $4)',
      [photo_url, address, description, userId]
    );
    res.json({ success: true, message: 'Report submitted!' });
  } catch (err) {
    console.error(err);
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
  const currentUserId = req.session.userId; // Get current user ID
  
  try {
    const result = await pool.query(
      `SELECT events.id, event_name, event_date, event_time, event_location, event_image_url, users.email AS user_email, events.number_participating, events.user_id
       FROM events
       JOIN users ON events.user_id = users.id
       ORDER BY events.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const events = result.rows;
    for (const event of events) {
      const isCompleted = new Date(event.event_date) < new Date();
      if (isCompleted) {
        const participantsResult = await pool.query(
          `SELECT users.email FROM participating
           JOIN users ON participating.user_id = users.id
           WHERE participating.event_id = $1`,
          [event.id]
        );
        event.participants = participantsResult.rows.map(row => row.email);
      } else {
        event.participants = [];
      }
      // Add flag to indicate if current user can delete this event
      event.canDelete = currentUserId && event.user_id === currentUserId;
    }
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch events.' });
  }
});

app.get('/api/admin/events', async (req, res) => {
  try {
    // Get all events with volunteer count
    const eventsResult = await pool.query(`
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

    const events = eventsResult.rows;

    // For completed events, fetch participant emails
    for (const event of events) {
      const isCompleted = new Date(event.event_date) < new Date();
      if (isCompleted) {
        const participantsResult = await pool.query(
          `SELECT users.email FROM participating
           JOIN users ON participating.user_id = users.id
           WHERE participating.event_id = $1`,
          [event.id]
        );
        event.participants = participantsResult.rows.map(row => row.email);
      } else {
        event.participants = [];
      }
    }

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch events.' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const currentUserId = req.session.userId;
  
  try {
    const result = await pool.query(
      `SELECT events.id, event_name, event_date, event_time, event_location, event_image_url, users.email AS user_email, events.number_participating, events.user_id
       FROM events
       JOIN users ON events.user_id = users.id
       WHERE events.id = $1`,
      [eventId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    const event = result.rows[0];
    const isCompleted = new Date(event.event_date) < new Date();
    if (isCompleted) {
      const participantsResult = await pool.query(
        `SELECT users.email FROM participating
         JOIN users ON participating.user_id = users.id
         WHERE participating.event_id = $1`,
        [event.id]
      );
      event.participants = participantsResult.rows.map(row => row.email);
    } else {
      event.participants = [];
    }
    // Add flag to indicate if current user can delete this event
    event.canDelete = currentUserId && event.user_id === currentUserId;
    res.json(event);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch event.' });
  }
});

app.post('/api/events/:id/join', async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  try {
    // Check if event exists and is not completed
    const eventResult = await pool.query(
      'SELECT event_date FROM events WHERE id = $1',
      [eventId]
    );
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const eventDate = new Date(eventResult.rows[0].event_date);
    if (eventDate < new Date()) {
      return res.status(400).json({ success: false, message: 'Cannot join completed event' });
    }

    // Check if user is already participating
    const existingParticipation = await pool.query(
      'SELECT 1 FROM participating WHERE event_id = $1 AND user_id = $2',
      [eventId, userId]
    );

    if (existingParticipation.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'You are already joined to this event' });
    }

    // Add user to participating table
    await pool.query(
      'INSERT INTO participating (event_id, user_id) VALUES ($1, $2)',
      [eventId, userId]
    );

    // Update the number_participating count in events table
    await pool.query(
      'UPDATE events SET number_participating = COALESCE(number_participating, 0) + 1 WHERE id = $1',
      [eventId]
    );

    res.json({ success: true, message: 'Successfully joined the event!' });
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

//all reports
app.get('/api/admin/reports', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT reports.id, reports.address, reports.description, reports.status, users.email AS reporter_email
      FROM reports
      LEFT JOIN users ON reports.user_id = users.id
      ORDER BY reports.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch reports.' });
  }
});

//single report
app.get('/api/admin/report/:id', async (req, res) => {
  const reportId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT reports.*, users.email AS reporter_email
       FROM reports
       LEFT JOIN users ON reports.user_id = users.id
       WHERE reports.id = $1`,
      [reportId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch report.' });
  }
});

app.post('/api/admin/report-status', async (req, res) => {
  const { id, status } = req.body;
  try {
    await pool.query('UPDATE reports SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update status.' });
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
  console.log('Session userId:', req.session.userId); // Add this line
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
  `SELECT e.id, e.event_name, e.event_date
   FROM participating p
   JOIN events e ON p.event_id = e.id
   WHERE p.user_id = $1 AND e.event_date < CURRENT_DATE
   ORDER BY e.event_date DESC`,
  [userId]
);

      const joinedCompleted = [];
for (const ev of joinedCompletedResult.rows) {
  const participantsResult = await pool.query(
    `SELECT users.email FROM participating
     JOIN users ON participating.user_id = users.id
     WHERE participating.event_id = $1`,
    [ev.id]
  );
  joinedCompleted.push({
    ...ev,
    participants: participantsResult.rows.map(row => row.email)
  });
}

    const reportsResult = await pool.query(
      'SELECT id, address, description, status FROM reports WHERE user_id = $1 ORDER BY id DESC',
      [userId]
    );

    res.json({
  email,
  createdEvents: createdEventsResult.rows,
  joinedUpcoming: joinedUpcomingResult.rows,
  joinedCompleted,
  reports: reportsResult.rows
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
  `SELECT e.id, e.event_name, e.event_date
   FROM participating p
   JOIN events e ON p.event_id = e.id
   WHERE p.user_id = $1 AND e.event_date < CURRENT_DATE
   ORDER BY e.event_date DESC`,
  [userId]
);
    const reportsResult = await pool.query(
      'SELECT id, address, description, status FROM reports WHERE user_id = $1 ORDER BY id DESC',
      [userId]
    );

    const joinedCompleted = [];
for (const ev of joinedCompletedResult.rows) {
  const participantsResult = await pool.query(
    `SELECT users.email FROM participating
     JOIN users ON participating.user_id = users.id
     WHERE participating.event_id = $1`,
    [ev.id]
  );
  joinedCompleted.push({
    ...ev,
    participants: participantsResult.rows.map(row => row.email)
  });
}
    res.json({
  email,
  createdEvents: createdEventsResult.rows,
  joinedUpcoming: joinedUpcomingResult.rows,
  joinedCompleted,
  reports: reportsResult.rows
});
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
});

app.post('/api/admin/ban-user', async (req, res) => {
  const { email } = req.body;
  // Prevent banning the admin
  const adminResult = await pool.query('SELECT is_admin FROM users WHERE email = $1', [email]);
  if (adminResult.rows[0]?.is_admin) {
    return res.status(400).json({ success: false, message: 'Cannot ban admin user.' });
  }
  try {
    await pool.query('INSERT INTO blacklist (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to ban user.' });
  }
});

app.post('/api/admin/unban-user', async (req, res) => {
  const { email } = req.body;
  try {
    await pool.query('DELETE FROM blacklist WHERE email = $1', [email]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to unban user.' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  try {
    // Check if event exists and user is the creator
    const eventResult = await pool.query(
      'SELECT user_id FROM events WHERE id = $1',
      [eventId]
    );
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (eventResult.rows[0].user_id !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own events' });
    }

    // Delete from participating table first (foreign key constraint)
    await pool.query('DELETE FROM participating WHERE event_id = $1', [eventId]);
    
    // Delete the event
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);

    res.json({ success: true, message: 'Event deleted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete event.' });
  }
});

//The directory that has server.js
app.use(express.static(__dirname));
// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
