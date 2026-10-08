const registrationForm = document.getElementById("registrationForm");
const registrationStatus = document.getElementById("registrationStatus");
const registrationSubmit = document.getElementById("registrationSubmit");
const dateOfRegistration = new Date();
const localDate = new Date(dateOfRegistration.getTime() - dateOfRegistration.getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10);

registrationForm.elements.namedItem("DATE OF REG").value = localDate;

registrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registrationStatus.textContent = "";
  registrationStatus.className = "registration-status";
  registrationSubmit.disabled = true;
  registrationSubmit.textContent = "Submitting...";

  const record = Object.fromEntries(new FormData(registrationForm).entries());

  try {
    const response = await fetch("/api/realtors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "We couldn't submit your registration. Please try again.");
    }

    registrationForm.reset();
    registrationForm.elements.namedItem("DATE OF REG").value = localDate;
    registrationStatus.textContent = `Thanks for registering. Your realtor ID is ${data.record["REALTOR ID NO"]}. You can now sign in with your phone number or email.`;
    registrationStatus.classList.add("registration-status-success");
  } catch (error) {
    registrationStatus.textContent = error.message || "Unable to reach the server. Check your connection and try again.";
    registrationStatus.classList.add("registration-status-error");
  } finally {
    registrationSubmit.disabled = false;
    registrationSubmit.textContent = "Submit registration";
  }
});
