(() => {
  const table = "rental_listings";
  const fallbackImage =
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&h=600&fit=crop";

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function showMessage(container, message, isError = false) {
    container.replaceChildren(
      makeElement(
        "p",
        `col-span-full rounded-xl p-4 text-sm ${isError ? "bg-rose-50 text-rose-800" : "text-slate-500"}`,
        message
      )
    );
  }

  function describeError(error) {
    const message = error?.message || String(error);
    return /schema cache|could not find the table/i.test(message)
      ? `${message}. Run backend-schema.sql in the Supabase SQL Editor.`
      : message;
  }

  async function getPublishedRentals() {
    const pageSize = 1000;
    const rentals = [];
    let from = 0;

    while (true) {
      const { data, error } = await window.supabaseClient
        .from(table)
        .select("id, owner_id, owner_name, title, price, location, university, property_type, amenities, image_urls, description, latitude, longitude, distance_km, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      rentals.push(...(data || []));
      if (!data || data.length < pageSize) return rentals;
      from += pageSize;
    }
  }

  function rentalCard(rental) {
    const card = makeElement(
      "article",
      "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
    );
    card.dataset.type = rental.property_type || "";
    card.dataset.price = String(rental.price);
    card.dataset.location = `${rental.location} ${rental.university || ""}`.toLowerCase();
    const image = makeElement("img", "h-44 w-full bg-slate-200 object-cover");
    image.src = rental.image_urls?.[0] || fallbackImage;
    image.alt = rental.title;
    image.loading = "lazy";
    card.append(image);

    const content = makeElement("div", "p-4");
    const headingRow = makeElement("div", "flex items-start justify-between gap-2");
    headingRow.append(
      makeElement("h2", "font-semibold text-slate-900", rental.title),
      makeElement("span", "whitespace-nowrap font-bold text-primary-600", `$${rental.price}/mo`)
    );
    content.append(headingRow);
    content.append(
      makeElement(
        "p",
        "mt-1 text-xs text-slate-500",
        `📍 ${rental.location}${rental.university ? ` · near ${rental.university}` : ""}`
      )
    );

    const amenities = makeElement("div", "mt-3 flex flex-wrap gap-1.5");
    (rental.amenities || []).slice(0, 4).forEach(item => {
      amenities.append(makeElement("span", "rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600", item));
    });
    content.append(amenities);

    const footer = makeElement("div", "mt-4 flex items-center justify-between border-t border-slate-100 pt-3");
    footer.append(
      makeElement("span", "text-xs text-slate-600", rental.owner_name || "NearU landlord")
    );
    const details = makeElement(
      "a",
      "rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50",
      "View Details"
    );
    details.href = `property-detail.html?id=${encodeURIComponent(rental.id)}`;
    footer.append(details);
    content.append(footer);
    card.append(content);
    return card;
  }

  function typeMatches(type, selection) {
    if (!selection) return true;
    const normalized = (type || "").toLowerCase();
    if (selection === "private") return normalized.includes("private");
    if (selection === "apartment") return normalized.includes("apartment") || normalized.includes("studio");
    if (selection === "house") return normalized.includes("house") || normalized.includes("shared");
    return normalized.includes(selection);
  }

  async function initializeHome() {
    const grid = document.querySelector("#featured-rentals");
    const searchButton = document.getElementById("home-search-submit");
    searchButton?.addEventListener("click", event => {
      event.preventDefault();
      const query = new URLSearchParams();
      const locationSearch = document.getElementById("home-search-location").value.trim();
      const maxPrice = document.getElementById("home-search-price").value;
      const type = document.getElementById("home-search-type").value;
      if (locationSearch) query.set("q", locationSearch);
      if (maxPrice) query.set("maxPrice", maxPrice);
      if (type) query.set("type", type);
      const queryString = query.toString();
      location.href = `listings.html${queryString ? `?${queryString}` : ""}`;
    });
    if (!grid) return;
    grid.replaceChildren();
    try {
      const allRentals = await getPublishedRentals();
      const rentals = allRentals.slice(0, 3);
      const listingCount = document.getElementById("active-listings-count");
      if (listingCount) listingCount.textContent = String(allRentals.length);
      if (window.heroMap) {
        allRentals.forEach(rental => {
          if (rental.latitude == null || rental.longitude == null) return;
          const popup = document.createElement("div");
          const link = makeElement("a", "font-medium text-primary-600", rental.title);
          link.href = `property-detail.html?id=${encodeURIComponent(rental.id)}`;
          popup.append(link);
          L.marker([rental.latitude, rental.longitude]).addTo(window.heroMap).bindPopup(popup);
        });
      }
      if (!rentals.length) {
        showMessage(grid, "No published rentals are available yet.");
        return;
      }
      grid.replaceChildren(...rentals.map(rentalCard));
    } catch (error) {
      showMessage(grid, `Could not load rentals: ${describeError(error)}`, true);
    }
  }

  async function initializeListings() {
    const grid = document.getElementById("propertyGrid");
    if (!grid) return;
    grid.replaceChildren();
    document.getElementById("pagination")?.classList.add("hidden");
    const resultText = document.getElementById("resultText");
    const price = document.getElementById("priceFilter");
    const distance = document.getElementById("distanceFilter");
    const sort = document.getElementById("sortSelect");
    const typeFilters = [...document.querySelectorAll(".property-filter")];
    const amenityFilters = [...document.querySelectorAll(".amenity-filter")];
    let rentals = [];

    function render() {
      const selectedTypes = typeFilters.filter(input => input.checked).map(input => input.value);
      const selectedAmenities = amenityFilters.filter(input => input.checked).map(input => input.value);
      const urlParams = new URLSearchParams(location.search);
      const search = (urlParams.get("q") || "").trim().toLowerCase();
      const urlType = urlParams.get("type");
      const requestedMaxPrice = Number(urlParams.get("maxPrice"));
      const maxPrice = Number(price.value);
      const maxDistance = Number(distance.value);

      const matches = rentals.filter(rental => {
        const searchable = `${rental.title} ${rental.location} ${rental.university}`.toLowerCase();
        return Number(rental.price) <= Math.min(maxPrice, Number.isFinite(requestedMaxPrice) && requestedMaxPrice > 0 ? requestedMaxPrice : maxPrice) &&
          (rental.distance_km == null || Number(rental.distance_km) <= maxDistance) &&
          selectedTypes.every(type => typeMatches(rental.property_type, type)) &&
          typeMatches(rental.property_type, urlType) &&
          selectedAmenities.every(item => {
            const terms = {
              wifi: ["wifi"],
              ac: ["airconditioning", "aircon"],
              bathroom: ["privatebathroom", "bathroom"],
              kitchen: ["kitchen"]
            }[item] || [item];
            return (rental.amenities || []).some(amenity => {
              const normalized = amenity.toLowerCase().replace(/[^a-z0-9]/g, "");
              return terms.some(term => normalized.includes(term));
            });
          }) &&
          (!search || searchable.includes(search));
      });

      if (sort.value === "low") matches.sort((a, b) => Number(a.price) - Number(b.price));
      if (sort.value === "high") matches.sort((a, b) => Number(b.price) - Number(a.price));
      if (sort.value === "distance") {
        matches.sort((a, b) =>
          (a.distance_km == null ? Infinity : Number(a.distance_km)) -
          (b.distance_km == null ? Infinity : Number(b.distance_km))
        );
      }
      if (!matches.length) {
        showMessage(grid, "No matching published rentals found.");
      } else {
        grid.replaceChildren(...matches.map(rentalCard));
      }
      resultText.textContent = `Showing ${matches.length} of ${rentals.length} published rentals`;
      const noResults = document.getElementById("noResults");
      if (noResults) noResults.classList.add("hidden");
      const pagination = document.getElementById("pagination");
      if (pagination) pagination.classList.add("hidden");
    }

    try {
      rentals = await getPublishedRentals();
      render();
      document.getElementById("applyFilters").addEventListener("click", render);
      document.getElementById("clearFilters").addEventListener("click", () => {
        price.value = price.max;
        distance.value = distance.max;
        typeFilters.forEach(input => { input.checked = false; });
        amenityFilters.forEach(input => { input.checked = false; });
        document.getElementById("priceValue").textContent = `$${price.value}`;
        document.getElementById("distanceValue").textContent = `Up to ${distance.value} km`;
        render();
      });
      price.addEventListener("input", () => {
        document.getElementById("priceValue").textContent = `$${price.value}`;
      });
      distance.addEventListener("input", () => {
        document.getElementById("distanceValue").textContent = `Up to ${distance.value} km`;
      });
      sort.addEventListener("change", render);
    } catch (error) {
      resultText.textContent = "Could not load rentals.";
      showMessage(grid, `Could not load rentals: ${describeError(error)}`, true);
    }
  }

  async function initializeDetail() {
    const title = document.getElementById("property-title");
    if (!title) return;
    title.textContent = "";
    document.getElementById("property-location").textContent = "";
    document.getElementById("property-nearby").textContent = "";
    document.getElementById("property-description").textContent = "";
    document.getElementById("property-price").textContent = "";
    document.getElementById("landlord-name").textContent = "";
    document.getElementById("landlord-initial").textContent = "";
    document.getElementById("property-amenities").replaceChildren();
    const propertyImage = document.getElementById("property-image");
    propertyImage.removeAttribute("src");
    propertyImage.alt = "";
    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      title.textContent = "Rental not found";
      return;
    }

    try {
      const { data, error } = await window.supabaseClient
        .from(table)
        .select("id, owner_id, owner_name, title, price, location, university, property_type, amenities, image_urls, description, latitude, longitude, distance_km")
        .eq("id", id)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        title.textContent = "Rental not found";
        document.getElementById("property-description").textContent =
          "This rental may have been removed or is not published.";
        return;
      }

      document.title = `${data.title} | NearU`;
      title.textContent = data.title;
      document.getElementById("property-location").textContent = `📍 ${data.location}`;
      document.getElementById("property-nearby").textContent = data.university
        ? `Near ${data.university}${data.distance_km ? ` · ${data.distance_km} km away` : ""}`
        : data.location;
      document.getElementById("property-description").textContent = data.description || "Contact the landlord for more details.";
      document.getElementById("property-price").textContent = `$${data.price}/month`;
      const landlordName = data.owner_name || "NearU landlord";
      document.getElementById("landlord-name").textContent = landlordName;
      document.getElementById("landlord-initial").textContent = landlordName.charAt(0).toUpperCase();
      const image = document.getElementById("property-image");
      image.src = data.image_urls?.[0] || fallbackImage;
      image.alt = data.title;
      const amenities = document.getElementById("property-amenities");
      amenities.replaceChildren(...(data.amenities || []).map(item =>
        makeElement("li", "flex items-center gap-2 text-slate-600", `✓ ${item}`)
      ));

      const contactForm = document.getElementById("contact-form");
      contactForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const message = document.getElementById("contact-message");
        const status = document.getElementById("contact-status");
        status.textContent = "";
        const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
        if (sessionError) {
          status.textContent = sessionError.message;
          return;
        }
        if (!sessionData.session) {
          location.href = `login.html?redirect=${encodeURIComponent(location.href)}`;
          return;
        }
        const { error: insertError } = await window.supabaseClient.from("rental_inquiries").insert({
          rental_id: data.id,
          sender_id: sessionData.session.user.id,
          message: message.value.trim()
        });
        if (insertError) {
          status.textContent = `Could not send inquiry: ${insertError.message}`;
          return;
        }
        contactForm.reset();
        status.textContent = "Your message was sent to the landlord.";
      });
    } catch (error) {
      title.textContent = "Could not load rental";
      document.getElementById("property-description").textContent = describeError(error);
    }
  }

  async function initializeMap() {
    const mapElement = document.getElementById("map");
    if (!mapElement || !window.L) return;
    const map = window.rentalsMap || L.map(mapElement).setView([11.5564, 104.9282], 13);
    if (!window.rentalsMap) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }).addTo(map);
    }
    const list = document.getElementById("map-rentals");
    const locationFilter = document.getElementById("map-location-filter");
    const priceFilter = document.getElementById("map-price-filter");
    const priceDisplay = document.getElementById("map-price-display");
    const typeButtons = [...document.querySelectorAll("[data-map-type]")];

    try {
      const rentals = await getPublishedRentals();
      const markers = [];
      list.replaceChildren();
      const cards = [];
      rentals.forEach(rental => {
        if (rental.latitude != null && rental.longitude != null) {
          const popup = document.createElement("div");
          const link = makeElement("a", "font-medium text-primary-600", rental.title);
          link.href = `property-detail.html?id=${encodeURIComponent(rental.id)}`;
          popup.append(link, makeElement("p", "text-sm", `$${rental.price}/month`));
          const marker = L.marker([rental.latitude, rental.longitude]).addTo(map).bindPopup(popup);
          markers.push({ rental, marker });
        }
        const card = rentalCard(rental);
        card.className = "flex gap-3 rounded-xl border border-slate-200 p-3";
        const image = card.querySelector("img");
        image.className = "h-16 w-20 flex-shrink-0 rounded-lg object-cover";
        list.append(card);
        cards.push({ rental, card });
      });
      if (!rentals.length) showMessage(list, "No published rentals are available yet.");

      function applyMapFilters() {
        const search = locationFilter.value.trim().toLowerCase();
        const selectedType = typeButtons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.mapType;
        cards.forEach(({ rental, card }) => {
          const matches = Number(rental.price) <= Number(priceFilter.value) &&
            (!search || `${rental.title} ${rental.location} ${rental.university}`.toLowerCase().includes(search)) &&
            typeMatches(rental.property_type, selectedType);
          card.classList.toggle("hidden", !matches);
        });
        markers.forEach(({ rental, marker }) => {
          const searchMatches = !search || `${rental.title} ${rental.location} ${rental.university}`.toLowerCase().includes(search);
          const typeMatch = typeMatches(rental.property_type, selectedType);
          const priceMatch = Number(rental.price) <= Number(priceFilter.value);
          if (searchMatches && typeMatch && priceMatch) marker.addTo(map);
          else map.removeLayer(marker);
        });
        const viewAll = document.getElementById("map-view-all");
        viewAll.textContent = `View all (${cards.filter(({ card }) => !card.classList.contains("hidden")).length})`;
      }

      typeButtons.forEach(button => {
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => {
          const wasSelected = button.getAttribute("aria-pressed") === "true";
          typeButtons.forEach(item => item.setAttribute("aria-pressed", "false"));
          if (!wasSelected) button.setAttribute("aria-pressed", "true");
          applyMapFilters();
        });
      });
      locationFilter.addEventListener("input", applyMapFilters);
      priceFilter.addEventListener("input", () => {
        priceDisplay.textContent = `$${priceFilter.value}`;
        applyMapFilters();
      });
      applyMapFilters();
    } catch (error) {
      showMessage(list, `Could not load rentals: ${describeError(error)}`, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initializeHome();
    initializeListings();
    initializeDetail();
    initializeMap();
  });
})();
