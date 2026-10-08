const adminLoginForm = document.getElementById("adminLoginForm");
const adminLoginStatus = document.getElementById("adminLoginStatus");
const adminLoginSubmit = document.getElementById("adminLoginSubmit");

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminLoginStatus.textContent = "";
  adminLoginStatus.className = "registration-status";
  adminLoginSubmit.disabled = true;
  adminLoginSubmit.textContent = "Signing in...";

  const credentials = Object.fromEntries(new FormData(adminLoginForm).entries());

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin", ...credentials })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to sign in. Check your credentials and try again.");
    }

    localStorage.setItem("realtorCurrentUser", JSON.stringify(data.user));
    window.location.href = "/realtors.html";
  } catch (error) {
    adminLoginStatus.textContent = error.message || "Unable to reach the server. Check your connection and try again.";
    adminLoginStatus.classList.add("registration-status-error");
  } finally {
    adminLoginSubmit.disabled = false;
    adminLoginSubmit.textContent = "Sign in";
  }
});
