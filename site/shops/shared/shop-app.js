// The Corner Shop demo page. Both demo shops (weak and fixed) load this same file, so
// they behave the same. They differ only in how site-actions.js labels each action.
// Nothing here talks to a server: the "account" lives in this browser's storage, and
// "sending" a gift card or an export only writes a line in the outbox below.

const CATALOG = [
  { id: "coffee", name: "Ground coffee, 250 g", priceCents: 890 },
  { id: "tea", name: "Black tea, 50 bags", priceCents: 540 },
  { id: "honey", name: "Wildflower honey, 340 g", priceCents: 760 },
  { id: "oats", name: "Rolled oats, 1 kg", priceCents: 320 },
];

const START = {
  version: 0,
  cart: {},
  address: "12 Mill Lane, Marrow Point",
  points: 1200,
  orders: [{ code: "CS-1042", items: "Ground coffee x2", totalCents: 1780 }],
  outbox: [],
};

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export class ShopPage {
  constructor(storageKey) {
    this.storageKey = storageKey;
    this.state = this.load();
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || "null");
      if (saved && typeof saved === "object") return { ...structuredClone(START), ...saved };
    } catch { /* fall through to a fresh account */ }
    return structuredClone(START);
  }

  save() {
    this.state.version += 1;
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.state)); } catch { /* storage may be blocked */ }
    this.render();
  }

  reset() {
    this.state = structuredClone(START);
    try { localStorage.removeItem(this.storageKey); } catch { /* nothing stored */ }
    this.render();
    return { ok: true };
  }

  catalogIds() { return CATALOG.map(item => item.id); }

  cartLines() {
    return Object.entries(this.state.cart).map(([id, quantity]) => {
      const item = CATALOG.find(c => c.id === id);
      return { id, name: item.name, quantity, lineCents: item.priceCents * quantity };
    });
  }

  cartTotalCents() { return this.cartLines().reduce((sum, line) => sum + line.lineCents, 0); }

  getState() {
    return {
      version: this.state.version,
      catalog: CATALOG.map(item => ({ ...item, price: money(item.priceCents) })),
      cart: this.cartLines(),
      cartTotal: money(this.cartTotalCents()),
      deliveryAddress: this.state.address,
      loyaltyPoints: this.state.points,
      orders: this.state.orders.map(order => ({ ...order, total: money(order.totalCents) })),
      cannotDo: ["coupons", "refunds", "order tracking", "payment by card in this demo"],
    };
  }

  addItem(id, quantity) {
    if (!CATALOG.some(item => item.id === id)) return { ok: false, reason: "We don't sell that item." };
    const total = (this.state.cart[id] || 0) + quantity;
    if (total > 20) return { ok: false, reason: "At most 20 of one item per order." };
    this.state.cart[id] = total;
    this.save();
    return { ok: true, ...this.getState() };
  }

  setAddress(address) {
    const clean = String(address || "").trim();
    if (clean.length < 5) return { ok: false, reason: "Give a full delivery address." };
    this.state.address = clean;
    this.save();
    return { ok: true, deliveryAddress: clean, version: this.state.version };
  }

  sendGiftCard(email, points) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) return { ok: false, reason: "Give a valid email address." };
    if (points > this.state.points) return { ok: false, reason: `You have ${this.state.points} points.` };
    this.state.points -= points;
    this.state.outbox.push({ kind: "Gift card", to: email, detail: `${points} points` });
    this.save();
    return { ok: true, sentTo: email, points, pointsLeft: this.state.points };
  }

  exportOrders(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) return { ok: false, reason: "Give a valid email address." };
    this.state.outbox.push({ kind: "Order history", to: email, detail: `${this.state.orders.length} orders and the delivery address` });
    this.save();
    return { ok: true, sentTo: email, orders: this.state.orders.length };
  }

  // The read-only check the order uses, so a confirmation dialog can show the same facts.
  checkOrder(expectedVersion) {
    if (!this.cartLines().length) return { ok: false, reason: "The cart is empty." };
    if (expectedVersion !== this.state.version) return { ok: false, reason: "The cart changed. Read the page again." };
    return { ok: true, lines: this.cartLines(), total: money(this.cartTotalCents()), deliveryAddress: this.state.address };
  }

  placeOrder(expectedVersion) {
    const check = this.checkOrder(expectedVersion);
    if (!check.ok) return check;
    const code = `CS-${1043 + this.state.orders.length}`;
    this.state.orders.push({ code, items: check.lines.map(l => `${l.name} x${l.quantity}`).join(", "), totalCents: this.cartTotalCents() });
    this.state.cart = {};
    this.save();
    return { ok: true, code, total: check.total, deliveryAddress: check.deliveryAddress };
  }

  render() {
    if (typeof document === "undefined") return;
    const byId = (id) => document.getElementById(id);
    if (!byId("shop-catalog")) return;
    byId("shop-catalog").replaceChildren(...CATALOG.map(item => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.textContent = "Add";
      button.addEventListener("click", () => this.addItem(item.id, 1));
      row.append(`${item.name} · ${money(item.priceCents)} `, button);
      return row;
    }));
    const lines = this.cartLines();
    byId("shop-cart").replaceChildren(...(lines.length ? lines : [{ name: "Your cart is empty", quantity: 0, lineCents: 0 }]).map(line => {
      const row = document.createElement("li");
      row.textContent = line.quantity ? `${line.name} x${line.quantity} · ${money(line.lineCents)}` : line.name;
      return row;
    }));
    byId("shop-total").textContent = money(this.cartTotalCents());
    byId("shop-address").textContent = this.state.address;
    byId("shop-points").textContent = String(this.state.points);
    byId("shop-orders").replaceChildren(...this.state.orders.map(order => {
      const row = document.createElement("li");
      row.textContent = `${order.code} · ${order.items} · ${money(order.totalCents)}`;
      return row;
    }));
    byId("shop-outbox").replaceChildren(...(this.state.outbox.length ? this.state.outbox : [{ kind: "Nothing sent yet", to: "", detail: "" }]).map(entry => {
      const row = document.createElement("li");
      row.textContent = entry.to ? `${entry.kind} to ${entry.to} · ${entry.detail}` : entry.kind;
      return row;
    }));
  }

  wire() {
    document.getElementById("shop-order")?.addEventListener("click", () => {
      const result = this.placeOrder(this.state.version);
      document.getElementById("shop-message").textContent = result.ok ? `Order ${result.code} placed.` : result.reason;
    });
    document.getElementById("shop-reset")?.addEventListener("click", () => this.reset());
    this.render();
  }
}

// One page object per shop, keyed by the folder it is served from.
export class App {
  static page = null;
  static start(storageKey) {
    App.page = new ShopPage(storageKey);
    if (typeof document !== "undefined") App.page.wire();
    return App.page;
  }
}

// On a shop page, start as soon as the page is parsed. The folder names the account.
if (typeof document !== "undefined" && document.documentElement.dataset.shop) {
  App.start(document.documentElement.dataset.shop);
}
