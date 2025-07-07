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

      if (result.success) {
        if (result.showRecovery && result.recoveryPhrase) {
          // Show the recovery phrase modal
          document.getElementById('recoveryPhraseDisplay').textContent = result.recoveryPhrase;
          document.getElementById('recoveryModal').style.display = 'flex';
        } else {
          alert('Signup successful!');
          window.location.href = 'login.html';
        }
      } else {
        alert(result.message);
      }

    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred. Please try again.');
    }
  });

});

function closeModal() {
  document.getElementById('recoveryModal').style.display = 'none';
  window.location.href = 'login.html';
}