document.addEventListener("DOMContentLoaded", () => {
  const dashboard = document.getElementById("landlord-dashboard");
  if (dashboard) {
    loadLandlordDashboard().catch(error => {
      document.getElementById("landlord-dashboard-status").textContent =
        `Could not load your listings: ${describeBackendError(error)}`;
    });
  }

  const form = document.getElementById("landlord-listing-form");
  if (!form) return;

  const status = document.getElementById("listing-status");
  const submitButton = form.querySelector('button[type="submit"]');
  const imageInput = document.getElementById("listing-photos");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    status.textContent = "";
    submitButton.disabled = true;

    try {
      const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        location.href = `login.html?redirect=${encodeURIComponent("landlords.html#form")}`;
        return;
      }

      const files = [...imageInput.files];
      if (files.length > 10) throw new Error("Upload a maximum of 10 photos.");
      if (files.some(file => !["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
        throw new Error("Photos must be JPG or PNG files no larger than 5 MB each.");
      }

      const user = sessionData.session.user;
      const imageUrls = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await window.supabaseClient.storage
          .from("rental-images")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = window.supabaseClient.storage
          .from("rental-images")
          .getPublicUrl(path);
        imageUrls.push(publicUrl.publicUrl);
      }

      const amenities = [...form.querySelectorAll("[name='amenities']:checked")].map(input => input.value);
      const { error: insertError } = await window.supabaseClient.from("rental_listings").insert({
        owner_id: user.id,
        owner_name: user.user_metadata?.full_name || "NearU landlord",
        status: "published",
        title: document.getElementById("listing-title").value.trim(),
        price: Number(document.getElementById("listing-price").value),
        location: document.getElementById("listing-location").value.trim(),
        university: document.getElementById("listing-university").value,
        property_type: document.getElementById("listing-type").value,
        amenities,
        image_urls: imageUrls,
        description: document.getElementById("listing-description").value.trim(),
        latitude: document.getElementById("listing-latitude").value
          ? Number(document.getElementById("listing-latitude").value)
          : null,
        longitude: document.getElementById("listing-longitude").value
          ? Number(document.getElementById("listing-longitude").value)
          : null,
        distance_km: document.getElementById("listing-distance").value
          ? Number(document.getElementById("listing-distance").value)
          : null
      });
      if (insertError) throw insertError;

      window.location.href = "my-listings.html?submitted=1";
    } catch (error) {
      status.textContent = `Could not submit listing: ${describeBackendError(error)}`;
    } finally {
      submitButton.disabled = false;
    }
  });
});

async function loadLandlordDashboard() {
  const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return;

  const dashboard = document.getElementById("landlord-dashboard");
  const status = document.getElementById("landlord-dashboard-status");
  const content = document.getElementById("landlord-dashboard-content");
  dashboard.classList.remove("hidden");

  const { data: rentals, error: rentalsError } = await window.supabaseClient
    .from("rental_listings")
    .select("id, title, status, created_at")
    .eq("owner_id", sessionData.session.user.id)
    .order("created_at", { ascending: false });
  if (rentalsError) throw rentalsError;

  if (!rentals.length) {
    status.textContent = "You have not submitted any listings yet.";
    return;
  }

  const rentalIds = rentals.map(rental => rental.id);
  const { data: inquiries, error: inquiriesError } = await window.supabaseClient
    .from("rental_inquiries")
    .select("rental_id, message, created_at")
    .in("rental_id", rentalIds)
    .order("created_at", { ascending: false });
  if (inquiriesError) throw inquiriesError;

  const escapeElement = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  };
  content.replaceChildren();

  rentals.forEach(rental => {
    const section = escapeElement("section", "rounded-xl border border-slate-200 p-4", "");
    const heading = escapeElement("h3", "font-semibold text-slate-900", rental.title);
    const state = escapeElement(
      "p",
      "mt-1 text-sm text-slate-500",
      `Status: ${rental.status} · Submitted ${new Date(rental.created_at).toLocaleDateString()}`
    );
    section.append(heading, state);
    const rentalInquiries = inquiries.filter(inquiry => inquiry.rental_id === rental.id);
    rentalInquiries.forEach(inquiry => {
      section.append(
        escapeElement(
          "p",
          "mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700",
          `${inquiry.message} · ${new Date(inquiry.created_at).toLocaleString()}`
        )
      );
    });
    content.append(section);
  });
  status.textContent = `${rentals.length} listing${rentals.length === 1 ? "" : "s"} · ${inquiries.length} inquiry${inquiries.length === 1 ? "" : "ies"}`;
}

function describeBackendError(error) {
  const message = error?.message || String(error);
  return /schema cache|could not find the table/i.test(message)
    ? `${message}. Run backend-schema.sql in the Supabase SQL Editor.`
    : message;
}
