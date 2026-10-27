const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

function showFormMessage(message, isError = false) {
  const formMessage = document.getElementById("form-message");
  formMessage.textContent = message;
  formMessage.classList.remove(
    "hidden",
    "bg-amber-50",
    "text-amber-800",
    "bg-rose-50",
    "text-rose-800"
  );
  formMessage.classList.add(
    ...(isError ? ["bg-rose-50", "text-rose-800"] : ["bg-amber-50", "text-amber-800"])
  );
}

function setFormSubmitting(form, isSubmitting) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = isSubmitting;
  submitButton.classList.toggle("opacity-60", isSubmitting);
  submitButton.classList.toggle("cursor-not-allowed", isSubmitting);
}

function describeAuthBackendError(error) {
  const message = error?.message || String(error);
  return /schema cache|could not find the table/i.test(message)
    ? `${message}. Run backend-schema.sql in the Supabase SQL Editor.`
    : message;
}

function redirectAfterAuth() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect) {
    window.location.href = "index.html";
    return;
  }

  const target = new URL(redirect, window.location.href);
  window.location.href = target.origin === window.location.origin ? target.href : "index.html";
}

async function ensureProfile(user) {
  if (!user || !user.id) {
    throw new Error("The authenticated user profile is missing the account ID.");
  }

  const { error } = await window.supabaseClient
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name || "NearU User"
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (error) throw error;
}

if (signupForm) {
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirm-password");

  function validatePasswordMatch() {
    confirmPassword.setCustomValidity(
      confirmPassword.value && confirmPassword.value !== password.value
        ? "Passwords do not match."
        : ""
    );
  }

  confirmPassword.addEventListener("input", validatePasswordMatch);
  password.addEventListener("input", validatePasswordMatch);

  signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    validatePasswordMatch();
    if (!signupForm.reportValidity()) return;

    setFormSubmitting(signupForm, true);
    try {
      const { data, error } = await window.supabaseClient.auth.signUp({
        email: document.getElementById("email").value.trim(),
        password: password.value,
        options: {
          data: {
            full_name: document.getElementById("name").value.trim()
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        try {
          await ensureProfile(data.user);
        } catch (error) {
          showFormMessage(
            `Your account was created, but we could not create your profile: ${describeAuthBackendError(error)}`,
            true
          );
          return;
        }

        redirectAfterAuth();
        return;
      }

      showFormMessage(
        "Your account was created. Check your email to confirm your address, then log in."
      );
    } catch (error) {
      showFormMessage(error.message || "We could not create your account. Please try again.", true);
    } finally {
      setFormSubmitting(signupForm, false);
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;

    setFormSubmitting(loginForm, true);
    try {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
      });

      if (error) throw error;
      try {
        await ensureProfile(data.user);
      } catch (error) {
        showFormMessage(
          `You are logged in, but we could not create your profile: ${describeAuthBackendError(error)}`,
          true
        );
        return;
      }

      redirectAfterAuth();
    } catch (error) {
      showFormMessage(error.message || "We could not log you in. Please try again.", true);
    } finally {
      setFormSubmitting(loginForm, false);
    }
  });
}
