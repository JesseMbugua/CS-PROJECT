// Wait for the DOM to fully load before executing JavaScript
document.addEventListener('DOMContentLoaded', () => {
  
  // Add a submit event listener to the login form
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    
    //handles the response without reloading the page
    e.preventDefault();

    // Extract form data using FormData
    const formData = new FormData(e.target);

    //data object containing the email and password
    const data = {
      email: formData.get('email'),
      password: formData.get('password')
    };

    try {
      // Send the login data to the server using the Fetch API
      const response = await fetch('/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data),
  credentials: 'include' 
});

      //JSON response from the server
      const result = await response.json();
      if (result.success) {
      window.location.href = result.redirect; // Redirect based on backend response
      }
      else {
        alert(result.message);
}
    } catch (error) {
      alert('An error occurred during login.');
    }

  }); 

});