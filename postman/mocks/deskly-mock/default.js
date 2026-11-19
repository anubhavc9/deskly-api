const http = require("http");
const PORT = process.env.PORT || 4500;
const JSON_HEADER = { "Content-Type": "application/json" };

// ─── Seed data ────────────────────────────────────────────────────────────────
const DESKS = [
  { id: "desk-1", name: "Desk A1", zone: "A", floor: 1, available: true },
  { id: "desk-2", name: "Desk A2", zone: "A", floor: 1, available: true },
  { id: "desk-3", name: "Desk B1", zone: "B", floor: 2, available: false },
  { id: "desk-4", name: "Desk B2", zone: "B", floor: 2, available: true },
];

const SEED_BOOKINGS = [
  {
    id: "bkg_seed01",
    deskId: "desk-1",
    date: "2026-12-01",
    bookedBy: "Demo User",
    status: "confirmed",
    createdAt: "2026-11-01T10:00:00Z",
  },
  {
    id: "bkg_seed02",
    deskId: "desk-2",
    date: "2026-12-02",
    bookedBy: "Jane Smith",
    status: "confirmed",
    createdAt: "2026-11-02T09:30:00Z",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function requireApiKey(req, res) {
  const key = req.headers["x-api-key"];
  if (!key) {
    res.writeHead(401, JSON_HEADER);
    res.end(JSON.stringify({ error: "Unauthorized", message: "Missing X-API-Key header." }));
    return false;
  }
  return true;
}

function send(res, status, body) {
  res.writeHead(status, JSON_HEADER);
  res.end(JSON.stringify(body));
}

// ─── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { method } = req;
  // Strip query string for routing
  const url = req.url.split("?")[0];

  // @endpoint GET /health
  if (method === "GET" && url === "/health") {
    return send(res, 200, { status: "ok", service: "deskly-api", timestamp: new Date().toISOString(), mode: "mock" });
  }

  // @endpoint GET /desks
  if (method === "GET" && url === "/desks") {
    if (!requireApiKey(req, res)) return;
    const params = new URLSearchParams(req.url.split("?")[1] || "");
    const zone = params.get("zone");
    const desks = zone ? DESKS.filter((d) => d.zone === zone) : DESKS;
    return send(res, 200, { desks, total: desks.length });
  }

  // @endpoint GET /desks/:id
  const deskMatch = url.match(/^\/desks\/([^/]+)$/);
  if (method === "GET" && deskMatch) {
    if (!requireApiKey(req, res)) return;
    const desk = DESKS.find((d) => d.id === deskMatch[1]);
    if (!desk) return send(res, 404, { error: "Not Found", message: `Desk '${deskMatch[1]}' not found.` });
    return send(res, 200, { desk });
  }

  // @endpoint GET /bookings
  if (method === "GET" && url === "/bookings") {
    if (!requireApiKey(req, res)) return;
    const bookings = (await pm.state.get("bookings")) || SEED_BOOKINGS;
    const params = new URLSearchParams(req.url.split("?")[1] || "");
    const dateFilter = params.get("date");
    const deskFilter = params.get("deskId");
    let result = bookings;
    if (dateFilter) result = result.filter((b) => b.date === dateFilter);
    if (deskFilter) result = result.filter((b) => b.deskId === deskFilter);
    return send(res, 200, { bookings: result, total: result.length });
  }

  // @endpoint POST /bookings
  if (method === "POST" && url === "/bookings") {
    if (!requireApiKey(req, res)) return;
    const body = await parseBody(req);
    if (!body.deskId || !body.date || !body.bookedBy) {
      return send(res, 400, { error: "Bad Request", message: "Fields 'deskId', 'date', and 'bookedBy' are required." });
    }
    const desk = DESKS.find((d) => d.id === body.deskId);
    if (!desk) return send(res, 404, { error: "Not Found", message: `Desk '${body.deskId}' not found.` });
    const bookings = (await pm.state.get("bookings")) || [...SEED_BOOKINGS];
    const newBooking = {
      id: `bkg_${Date.now()}`,
      deskId: body.deskId,
      date: body.date,
      bookedBy: body.bookedBy,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    bookings.push(newBooking);
    await pm.state.set("bookings", bookings);
    return send(res, 201, { booking: newBooking });
  }

  // @endpoint GET /bookings/:id
  const bookingMatch = url.match(/^\/bookings\/([^/]+)$/);
  if (method === "GET" && bookingMatch) {
    if (!requireApiKey(req, res)) return;
    const bookings = (await pm.state.get("bookings")) || SEED_BOOKINGS;
    const booking = bookings.find((b) => b.id === bookingMatch[1]);
    if (!booking) return send(res, 404, { error: "Not Found", message: `Booking '${bookingMatch[1]}' not found.` });
    return send(res, 200, { booking });
  }

  // @endpoint DELETE /bookings/:id
  if (method === "DELETE" && bookingMatch) {
    if (!requireApiKey(req, res)) return;
    const bookings = (await pm.state.get("bookings")) || [...SEED_BOOKINGS];
    const idx = bookings.findIndex((b) => b.id === bookingMatch[1]);
    if (idx === -1) return send(res, 404, { error: "Not Found", message: `Booking '${bookingMatch[1]}' not found.` });
    bookings.splice(idx, 1);
    await pm.state.set("bookings", bookings);
    return send(res, 200, { message: `Booking '${bookingMatch[1]}' deleted successfully.` });
  }

  // ── 404 fallback ───────────────────────────────────────────────────────────
  send(res, 404, { error: "Not Found", message: `No handler for ${method} ${url}` });
});

server.listen(PORT, () => console.log(`Deskly Mock running on port ${PORT}`));
