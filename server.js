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

// signup POST request
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Insert the new user into the database
    await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2)',
      [email, password]
    );
    //Send a success response
    res.json({ success: true, message: 'Signup successful!' });
  } catch (err) {
    //error logged and sends error response
    console.error(err);
    res.status(500).json({ success: false, message: 'Signup failed.' });
  }
});

// login POST request
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

    try {
      // check if the user exists in the database
    const result = await pool.query(
      'SELECT * FROM users WHERE email=$1 AND password=$2',
      [email, password]
    );
    //Log the query to see the result I use it for debugging
    console.log('Query result:', result.rows); 

    if (result.rows.length > 0) {
      //If the user exists send success response
      res.json({ success: true, message: 'Login successful!' });
    } else {
      //If user does not exist send error response
      res.json({ success: false, message: 'Invalid login u bot' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
