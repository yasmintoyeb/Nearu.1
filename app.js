
async function testDatabase() {
  const { data, error } = await window.supabaseClient
    .from("rental_listings")
    .select("id, title, price, location")
    .limit(10);

  if (error) {
    console.error("Database error:", error);
    alert("Database error: " + error.message);
    return;
  }

  console.log("Database connected!");
  console.table(data);
  alert("Supabase connected successfully!");
}
