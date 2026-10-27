document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("my-listings-status");
  const grid = document.getElementById("my-listings-grid");

  try {
    const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      window.location.href = `login.html?redirect=${encodeURIComponent("my-listings.html")}`;
      return;
    }

    const { data: rentals, error } = await window.supabaseClient
      .from("rental_listings")
      .select("id, title, price, location, university, property_type, image_urls, status, created_at")
      .eq("owner_id", sessionData.session.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!rentals.length) {
      status.textContent = "You haven’t submitted any listings yet.";
      return;
    }

    grid.replaceChildren();
    const justSubmitted = new URLSearchParams(window.location.search).get("submitted") === "1";
    if (justSubmitted) {
      status.textContent = "Your listing is published and now available on All Listings.";
    }

    rentals.forEach(rental => {
      const card = document.createElement("article");
      card.className = "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm";
      const image = document.createElement("img");
      image.className = "h-48 w-full bg-slate-200 object-cover";
      image.src = rental.image_urls?.[0] || "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&h=600&fit=crop";
      image.alt = rental.title;
      image.loading = "lazy";

      const content = document.createElement("div");
      content.className = "p-5";
      const title = document.createElement("h2");
      title.className = "text-lg font-semibold text-slate-900";
      title.textContent = rental.title;
      const details = document.createElement("p");
      details.className = "mt-2 text-sm text-slate-600";
      details.textContent = `${rental.property_type} · ${rental.location} · $${rental.price}/month`;
      const state = document.createElement("p");
      state.className = rental.status === "published"
        ? "mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold capitalize text-emerald-800"
        : "mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-800";
      state.textContent = `Status: ${rental.status}`;
      const submitted = document.createElement("p");
      submitted.className = "mt-2 text-xs text-slate-500";
      submitted.textContent = `Submitted ${new Date(rental.created_at).toLocaleDateString()}`;
      content.append(title, details, state, submitted);

      if (rental.status === "published") {
        const view = document.createElement("a");
        view.className = "mt-4 inline-flex text-sm font-semibold text-primary-600 hover:underline";
        view.href = `property-detail.html?id=${encodeURIComponent(rental.id)}`;
        view.textContent = "View public listing";
        content.append(view);
      }

      card.append(image, content);
      grid.append(card);
    });
    status.textContent = `${rentals.length} listing${rentals.length === 1 ? "" : "s"} found.`;
  } catch (error) {
    status.textContent = `Could not load your listings: ${error.message}`;
  }
});
