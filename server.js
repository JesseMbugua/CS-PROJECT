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

//The directory that has server.js
app.use(express.static(__dirname));

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
        // Send success response!
        return res.json({ success: true, message: 'Login successful!' });
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
    console.error(err); // <-- Check this output!
    res.status(500).json({ success: false, message: 'Failed to submit report.' });
  }
});

// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
