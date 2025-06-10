// Wait until the entire DOM content has been loaded and parsed
document.addEventListener('DOMContentLoaded', () => {
  // Event listener for the signup form submission
  document.getElementById('signupForm').addEventListener('submit', async (e) => {
  //handles the response without reloading the page
    e.preventDefault();

    // Extract form data using FormData
    const formData = new FormData(e.target);
    const email = formData.get('email');// looks for the name = "email" in the form
    const password = formData.get('password'); 
    const confirmPassword = formData.get('confirmPassword');

    // Check if the passwords match
    if (password !== confirmPassword) {
      alert('Passwords do not match!');
      return;
    }

    try {
      // Send the signup data to the server using the Fetch API
      const response = await fetch('/signup', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();

      alert(result.message);

    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred. Please try again.');
    }
  });

});