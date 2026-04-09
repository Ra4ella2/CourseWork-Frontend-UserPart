import { useEffect, useState } from "react";
import Pagination from "@mui/material/Pagination";
import Stack from "@mui/material/Stack";
import "./App.css";
import Photo1 from './assets/crypto.jpg';
import Facebook from './assets/Facebook.png';
import Insta from './assets/Insta.png';
import TikTok from './assets/TikTok.png';
import Youtube from './assets/Youtube.png';
import PayPal from './assets/PayPal.png';
import Galochka from './assets/galochka.png';


const API_BASE = "https://mymarket.somee.com";
const FALLBACK_IMG = "https://via.placeholder.com/600x400?text=No+Image";
const TOKEN_KEY = "userAccessToken";
const CART_KEY = "cart";

type CategoryItem = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  category: string;
  description: string;
};

type CartItem = {
  productId: number;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
};

type OrderLine = {
  productId?: number;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type OrderDto = {
  id: number;
  createdAt: string;
  status: string;
  items: OrderLine[];
};

type AuthResponse = {
  accessToken?: string;
};

function decodeJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getRolesFromToken(token: string) {
  const payload = decodeJwt(token);
  if (!payload) return [];
  const roleKey =
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
  const r = payload[roleKey];
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

function isAdminToken(token: string) {
  return getRolesFromToken(token).includes("Admin");
}

function normalizeProduct(raw: any): Product {
  return {
    id: Number(raw.id ?? raw.Id ?? 0),
    name: String(raw.name ?? raw.Name ?? ""),
    price: Number(raw.price ?? raw.Price ?? 0),
    stock: Number(raw.stock ?? raw.Stock ?? 0),
    imageUrl: raw.imageUrl ?? raw.ImageUrl ?? null,
    category: String(raw.category ?? raw.Category ?? ""),
    description: String(raw.description ?? raw.Description?? "")
  };
}

function readCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [userEmail, setUserEmail] = useState("");
  const [productsCache, setProductsCache] = useState<Product[]>([]);
  const [statusText, setStatusText] = useState("");
  const [cart, setCart] = useState<CartItem[]>(readCart());

  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState("");

  const [page, setPage] = useState(1);
  const countCards = 6;

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authMsgType, setAuthMsgType] = useState<"" | "ok" | "error">("");

  const [cartMsg, setCartMsg] = useState("");
  const [cartMsgType, setCartMsgType] = useState<"" | "ok" | "error">("");

  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [ordersMsg, setOrdersMsg] = useState("");
  const [ordersMsgType, setOrdersMsgType] = useState<"" | "ok" | "error">("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearchId, setOrderSearchId] = useState("");

  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [orderDetailsMap, setOrderDetailsMap] = useState<Record<number, string[]>>({});
  const [orderDetailsLoading, setOrderDetailsLoading] = useState<Record<number, boolean>>({});

  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  
  const handleChangePage = (
    _event: React.ChangeEvent<unknown>,
    value: number
  ) => {
    setPage(value);
  };

  useEffect(() => {
    updateHeaderInfo(token);
    if (!token) {
      setCart([]);
      saveCart([]);
    }
    loadProducts();
    loadCategories();
  }, []);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  function openPayModal(orderId: number) {
    setSelectedOrderId(orderId);
    setIsPayModalOpen(true);
  }

  async function payOrder(orderId: number) {
    try {
      await apiFetch(`/api/user/myOrder/${orderId}/orderPaid`, {
        method: "PATCH",
        auth: true,
      });

      setOrdersMsg(`Замовлення #${orderId} оплачено`);
      setOrdersMsgType("ok");
      setIsPayModalOpen(false);
      setSelectedOrderId(null);

      await loadOrders();
      await loadProducts();
    } catch (e: any) {
      applyHttpError(e, setOrdersMsg, setOrdersMsgType);
    }
  }

  function canPayOrder(order: OrderDto) {
    return (
      order.status !== "Paid" &&
      order.status !== "Cancelled" &&
      order.status !== "Completed" &&
      order.status !== "Shipped"
    );
  }

  function updateHeaderInfo(currentToken: string | null) {
    if (!currentToken) {
      setUserEmail("");
      return;
    }

    const payload = decodeJwt(currentToken);
    const email = payload?.email ?? payload?.unique_name ?? "";
    setUserEmail(email);
  }

  async function apiFetch<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      auth?: boolean;
    } = {}
  ): Promise<T> {
    const { method = "GET", body = null, auth = true } = options;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (auth) {
      const currentToken = localStorage.getItem(TOKEN_KEY);
      if (currentToken) {
        headers.Authorization = `Bearer ${currentToken}`;
      }
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    const text = await res.text().catch(() => "");
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const msg =
        typeof data === "string"
          ? data
          : data?.message || data?.error || text || `HTTP ${res.status}`;

      const err: any = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data as T;
  }

  function applyHttpError(
    e: any,
    setter: (v: string) => void,
    typeSetter: (v: "" | "ok" | "error") => void
  ) {
    const s = e?.status;
    let msg = e?.message || "Помилка";

    if (s === 401) msg = "Треба увійти";
    if (s === 403) msg = "Немає прав";
    if (s === 404) msg = "Не знайдено";

    setter(msg);
    typeSetter("error");

    if (s === 401) {
      doLogout(false);
      openAuth();
    }
  }

  function openAuth() {
    setAuthMsg("");
    setAuthMsgType("");
    setIsAuthOpen(true);
  }

  function closeAuth() {
    setAuthMsg("");
    setAuthMsgType("");
    setIsAuthOpen(false);
  }

  function requireAuth() {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) return true;
    openAuth();
    return false;
  }

  function doLogout(withMessage = true) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CART_KEY);
    setToken(null);
    setUserEmail("");
    setCart([]);
    if (withMessage) setStatusText("Ви вийшли");
    setIsCartOpen(false);
    setIsOrdersOpen(false);
  }

  async function loadProducts() {
    setStatusText("Завантаження товарів...");

    try {
      const products = await apiFetch<any[]>("/api/user/products", {
        auth: false,
      });

      const normalized = (Array.isArray(products) ? products : []).map(
        normalizeProduct
      );

      setProductsCache(normalized);
      setStatusText(`Завантажено: ${normalized.length}`);
    } catch (e: any) {
      setStatusText("");
      if (e?.status === 401) {
        doLogout(false);
        return;
      }
      setProductsCache([]);
      setStatusText(`Помилка: ${e?.message || "Не вдалося завантажити товари"}`);
    }
  }
  async function loadCategories() {
    try {
      const result = await apiFetch<CategoryItem[]>("/api/user/categories", {
        auth: false,
      });
      setCategories(Array.isArray(result) ? result : []);
    } catch {
      setCategories([]);
    }
  }

  function getFilteredProducts(): Product[] {
    let filtered = [...productsCache];

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(query)
      );
    }

    if (categoryFilter) {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    if (minPrice.trim() !== "") {
      const min = Number(minPrice);
      if (!Number.isNaN(min)) {
        filtered = filtered.filter((p) => p.price >= min);
      }
    }

    if (maxPrice.trim() !== "") {
      const max = Number(maxPrice);
      if (!Number.isNaN(max)) {
        filtered = filtered.filter((p) => p.price <= max);
      }
    }

    if (sortType === "price_asc") {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortType === "price_desc") {
      filtered.sort((a, b) => b.price - a.price);
    } else if (sortType === "name_asc") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortType === "name_desc") {
      filtered.sort((a, b) => b.name.localeCompare(a.name));
    }

    return filtered;
  }

  const filteredProducts = getFilteredProducts();

  const totalPages = Math.ceil(filteredProducts.length / countCards) || 1;
  const startIndex = (page - 1) * countCards;
  const endIndex = startIndex + countCards;
  const currentProducts = filteredProducts.slice(startIndex, endIndex);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (
      searchQuery.trim() ||
      minPrice.trim() !== "" ||
      maxPrice.trim() !== "" ||
      sortType !== ""
    ) {
      setStatusText(`Знайдено товарів: ${filteredProducts.length}`);
    } else {
      setStatusText(`Завантажено: ${productsCache.length}`);
    }
  }, [searchQuery, categoryFilter, minPrice, maxPrice, sortType, productsCache]);

  function resetPriceFilters() {
    setPage(1);
    setMinPrice("");
    setMaxPrice("");
  }

  function resetSearch() {
    setPage(1);
    setSearchQuery("");
  }

  function resetCategoryFilter() {
    setPage(1);
    setCategoryFilter("");
  }

  function resetSort() {
    setPage(1);
    setSortType("");
  }

  
  function addToCart(product: Product) {
    if (!requireAuth()) return;

    setCart((prev) => {
      const copy = [...prev];
      const found = copy.find((x) => x.productId === product.id);

      if (found) {
        if (found.quantity + 1 > product.stock) return copy;
        found.quantity += 1;
      } else {
        if (product.stock <= 0) return copy;
        copy.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity: 1,
        });
      }

      return copy;
    });
  }

  function setQty(productId: number, qty: number) {
    setCart((prev) => {
      const copy = [...prev];
      const item = copy.find((x) => x.productId === productId);
      if (!item) return copy;

      const product = productsCache.find((p) => p.id === productId);
      const max = product ? product.stock : 999999;

      item.quantity = Math.max(1, Math.min(max, qty));
      return [...copy];
    });
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((x) => x.productId !== productId));
  }

  const cartCount = cart.reduce(
    (sum, x) => sum + (Number(x.quantity) || 0),
    0
  );

  const cartTotal = cart.reduce(
    (sum, x) =>
      sum + (Number(x.price) || 0) * (Number(x.quantity) || 0),
    0
  );

  async function onLogin() {
    setAuthMsg("");
    setAuthMsgType("");

    try {
      const res = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: { email: authEmail.trim(), password: authPassword },
        auth: false,
      });

      if (!res?.accessToken) {
        throw new Error("Немає accessToken в відповіді");
      }

      if (isAdminToken(res.accessToken)) {
        setAuthMsg(
          "Адмін не може входити в користувацький інтерфейс. Відкрий адмін-панель."
        );
        setAuthMsgType("error");
        return;
      }

      localStorage.setItem(TOKEN_KEY, res.accessToken);
      setToken(res.accessToken);
      updateHeaderInfo(res.accessToken);
      closeAuth();
      setAuthPassword("");
      await loadProducts();
    } catch (e: any) {
      setAuthMsg(e?.message || "Помилка входу");
      setAuthMsgType("error");
    }
  }

  async function onRegister() {
    setAuthMsg("");
    setAuthMsgType("");

    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: { email: authEmail.trim(), password: authPassword },
        auth: false,
      });

      setAuthMsg("Реєстрація успішна. Тепер натисни «Увійти».");
      setAuthMsgType("ok");
    } catch (e: any) {
      setAuthMsg(e?.message || "Помилка реєстрації");
      setAuthMsgType("error");
    }
  }

  async function onCheckout() {
    setCartMsg("");
    setCartMsgType("");

    if (!cart.length) return;

    try {
      const res = await apiFetch<{ orderId?: number }>(
        "/api/user/create/order",
        {
          method: "POST",
          body: {
            items: cart.map((x) => ({
              productId: x.productId,
              quantity: x.quantity,
            })),
          },
          auth: true,
        }
      );

      setCart([]);
      setCartMsg(`Замовлення створено! ID: ${res?.orderId ?? ""}`.trim());
      setCartMsgType("ok");
      await loadProducts();
    } catch (e: any) {
      applyHttpError(e, setCartMsg, setCartMsgType);
    }
  }

  async function openOrders() {
    if (!requireAuth()) return;

    setIsOrdersOpen(true);
    setOrdersMsg("");
    setOrdersMsgType("");
    await loadOrders();
  }

  async function loadOrders() {
    setOrdersLoading(true);
    setOrders([]);
    setOrdersMsg("");
    setOrdersMsgType("");

    try {
      const result = await apiFetch<OrderDto[]>("/api/user/myOrders", {
        auth: true,
      });

      if (!Array.isArray(result) || result.length === 0) {
        setOrders([]);
        setOrdersMsg("Замовлень немає");
        setOrdersMsgType("");
        return;
      }

      setOrders(result);
    } catch (e: any) {
      applyHttpError(e, setOrdersMsg, setOrdersMsgType);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadOrderById() {
    if (!requireAuth()) return;

    const id = Number(orderSearchId);
    if (!id || id <= 0) {
      setOrdersMsg("Введіть коректний ID замовлення");
      setOrdersMsgType("error");
      return;
    }

    setOrdersLoading(true);
    setOrders([]);
    setOrdersMsg("");
    setOrdersMsgType("");

    try {
      const order = await apiFetch<OrderDto>(`/api/user/myOrders/${id}`, {
        auth: true,
      });

      setOrders([order]);
      setOrdersMsg(`Знайдено замовлення #${id}`);
      setOrdersMsgType("ok");
    } catch (e: any) {
      applyHttpError(e, setOrdersMsg, setOrdersMsgType);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function toggleOrderDetails(orderId: number) {
    const isOpen = expandedOrders[orderId];

    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !isOpen,
    }));

    if (isOpen || orderDetailsMap[orderId] || orderDetailsLoading[orderId]) {
      return;
    }

    setOrderDetailsLoading((prev) => ({
      ...prev,
      [orderId]: true,
    }));

    try {
      const d = await apiFetch<OrderDto>(`/api/user/myOrders/${orderId}`, {
        auth: true,
      });

      const lines = (d.items || []).map(
        (i) =>
          `• ${i.productName} × ${i.quantity} = ${(i.unitPrice * i.quantity).toFixed(2)}`
      );

      setOrderDetailsMap((prev) => ({
        ...prev,
        [orderId]: lines.length ? lines : ["Немає позицій"],
      }));
    } catch (e: any) {
      setOrderDetailsMap((prev) => ({
        ...prev,
        [orderId]: [e?.message || "Помилка"],
      }));
    } finally {
      setOrderDetailsLoading((prev) => ({
        ...prev,
        [orderId]: false,
      }));
    }
  }

  async function cancelOrder(orderId: number) {
    try {
      await apiFetch(`/api/user/myOrder/${orderId}/status`, {
        method: "PATCH",
        auth: true,
      });

      setOrdersMsg(`Замовлення #${orderId} відхилено`);
      setOrdersMsgType("ok");
      await loadOrders();
      await loadProducts();
    } catch (e: any) {
      applyHttpError(e, setOrdersMsg, setOrdersMsgType);
    }
  }


  function formatOrderMeta(order: OrderDto) {
    const itemsCount = (order.items || []).length;
    return `${new Date(order.createdAt).toLocaleString()} • ${order.status} • позицій: ${itemsCount}`;
  }

  function canCancelOrder(order: OrderDto) {
    return order.status !== "Shipped" && order.status !== "Completed";
  }

  return (
    <>
      <header className="topbar">
        <div  className="topbarContent">
          <div className="brand">eMarket</div>

          <div className="h-actions">
            <button className="btn" type="button" onClick={openOrders}>
              Мої замовлення
            </button>

            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!requireAuth()) return;
                setCartMsg("");
                setCartMsgType("");
                setIsCartOpen(true);
              }}
            >
              Кошик (<span id="cartCount">{cartCount}</span>)
            </button>

            <div className="userInfo">{userEmail ? `👤 ${userEmail}` : ""}</div>

            <button
              className={`btn ${token ? "ghost-header" : ""}`}
              type="button"
              onClick={() => {
                if (token) {
                  doLogout(true);
                  loadProducts();
                } else {
                  openAuth();
                }
              }}
            >
              {token ? "Вихід" : "Вхід"}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="advertisements">
              <img src={Photo1}></img>
        </div>
        <div className="row">
          <h1 className="title">Товари</h1>
        </div>

        <div className="muted small status-text">{statusText}</div>

        <div className="price-filter">
          <div className="filter-group">
            <div className="sort-wrapper">
              <select
                id="categorySelect"
                value={categoryFilter}
                onChange={(e) => {
                  setPage(1);
                  setCategoryFilter(e.target.value);
                }}
              >
                <option value="">Усі категорії</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn ghost" type="button" onClick={resetCategoryFilter}>
              Скинути категорію
            </button>
          </div>
        </div>

        <div className="price-filter">
          <div className="filter-group">
            <div className="sort-wrapper">
              <select
                id="sortSelect"
                value={sortType}
                onChange={(e) => {
                  setPage(1);
                  setSortType(e.target.value);
                }}
              >
                <option value="">Без сортування</option>
                <option value="price_asc">Ціна: від дешевих</option>
                <option value="price_desc">Ціна: від дорогих</option>
                <option value="name_asc">Назва: А-Я</option>
                <option value="name_desc">Назва: Я-А</option>
              </select>
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn ghost" type="button" onClick={resetSort}>
              Скинути сортування
            </button>
          </div>
        </div>

        <div className="price-filter">
          <div className="filter-group">
            <input
              id="minPriceInput"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ціна від"
              value={minPrice}
              onChange={(e) => {
                setPage(1);
                setMinPrice(e.target.value);
              }}
            />
            <input
              id="maxPriceInput"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ціна до"
              value={maxPrice}
              onChange={(e) => {
                setPage(1);
                setMaxPrice(e.target.value);
              }}
            />
          </div>

          <div className="filter-actions">
            <button className="btn modalbtn" type="button">
              Фільтр
            </button>
            <button
              className="btn ghost"
              id="priceFilterResetBtn"
              type="button"
              onClick={resetPriceFilters}
            >
              Скинути
            </button>
          </div>
        </div>

        <div className="price-filter">
          <div className="filter-group">
            <input
              id="searchInput"
              type="text"
              placeholder="Пошук товару по імені"
              value={searchQuery}
              onChange={(e) => {
                setPage(1);
                setSearchQuery(e.target.value);
              }}
            />
          </div>

          <div className="filter-actions">
            <button
              className="btn ghost"
              id="searchResetBtn"
              type="button"
              onClick={resetSearch}
            >
              Скинути пошук
            </button>
          </div>
        </div>

        <section className="grid" id="productsGrid">
          {filteredProducts.length > 0 ? (
            currentProducts.map((p) => (
              <article
                className="card product-card"
                key={p.id}
                onClick={() => setSelectedProduct(p)}
              >
                <img
                  className="product-img"
                  src={p.imageUrl || FALLBACK_IMG}
                  alt={p.name}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_IMG;
                  }}
                />

                <div className="card-title">{p.name}</div>
                <div className="muted">Залишок: {p.stock}</div>
                <div className="price">{p.price.toFixed(2)} ₴</div>

                <div className="card-actions">
                  <button
                    className="btn modalbtn addBtn"
                    type="button"
                    disabled={p.stock <= 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(p);
                    }}
                  >
                    {p.stock <= 0 ? "Немає в наявності" : "В кошик"}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="muted empty-box">Товарів немає</div>
          )}
        </section>

        {filteredProducts.length > 0 && (
          <Stack spacing={2} sx={{ mt: 3, mb: 4, alignItems: "center" }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handleChangePage}
              sx={{
              "& .Mui-selected": {
                backgroundColor: "#232324",
                color: "#fff",
                borderColor: "#2f2f34",
              },
            }}
            />
          </Stack>
        )}
      </main>

      {isAuthOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={closeAuth}></div>

          <div className="modal-card auth-modal-card">
            <div className="modal-head">
              <div className="modal-title">Акаунт</div>
              <button className="iconbtn" type="button" onClick={closeAuth}>
                ✕
              </button>
            </div>

            <form
              className="form auth-form"
              onSubmit={(e) => e.preventDefault()}
            >
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </label>

              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </label>

              <div className="row auth-buttons">
                <button className="btn modalbtn" type="button" onClick={onLogin}>
                  Увійти
                </button>
                <button
                  className="btn modalbtn"
                  type="button"
                  onClick={onRegister}
                >
                  Реєстрація
                </button>
              </div>

              <div className={`hint ${authMsgType}`}>{authMsg}</div>
            </form>
          </div>
        </div>
      )}

      {isCartOpen && (
        <div className="modal">
          <div
            className="modal-backdrop"
            onClick={() => setIsCartOpen(false)}
          ></div>

          <div className="modal-card wide cart-modal-card">
            <div className="modal-head">
              <div className="modal-title">Кошик</div>
              <button
                className="iconbtn"
                type="button"
                onClick={() => setIsCartOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="list">
              {cart.length ? (
                cart.map((item) => (
                  <div className="item" key={item.productId}>
                    <img
                      src={item.imageUrl || FALLBACK_IMG}
                      alt={item.name}
                      onError={(e) => {
                        e.currentTarget.src = FALLBACK_IMG;
                      }}
                    />

                    <div>
                      <div className="item-title">{item.name}</div>
                      <div className="item-sub">
                        {Number(item.price).toFixed(2)} × {item.quantity}
                      </div>
                    </div>

                    <div className="qty">
                      <button
                        className="mini"
                        type="button"
                        onClick={() => setQty(item.productId, item.quantity - 1)}
                      >
                        −
                      </button>
                      <div className="num">{item.quantity}</div>
                      <button
                        className="mini"
                        type="button"
                        onClick={() => setQty(item.productId, item.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        className="mini"
                        type="button"
                        onClick={() => removeFromCart(item.productId)}
                      >
                        Видалити
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">Кошик пустий</div>
              )}
            </div>

            <div className="cart-foot">
              <div className="cart-total">
                Разом: <span>{cartTotal.toFixed(2)}</span>
              </div>

              <div className="row end">
                <button
                  className="btn modalbtn"
                  type="button"
                  disabled={!cart.length}
                  onClick={onCheckout}
                >
                  Оформити замовлення
                </button>
              </div>
            </div>

            <div className={`hint ${cartMsgType}`}>{cartMsg}</div>
          </div>
        </div>
      )}

      {isOrdersOpen && (
        <div className="modal">
          <div
            className="modal-backdrop"
            onClick={() => setIsOrdersOpen(false)}
          ></div>

          <div className="modal-card wide orders-modal-card">
            <div className="modal-head">
              <div className="modal-title">Мої замовлення</div>
              <button
                className="iconbtn"
                type="button"
                onClick={() => setIsOrdersOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="row end orders-search-row">
              <input
                id="orderSearchInput"
                type="number"
                min="1"
                placeholder="ID заказа"
                value={orderSearchId}
                onChange={(e) => setOrderSearchId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadOrderById();
                }}
              />
              <button
                className="btn modalbtn"
                id="orderSearchBtn"
                type="button"
                onClick={loadOrderById}
              >
                Знайти
              </button>
              <button
                className="btn ghost"
                id="orderSearchResetBtn"
                type="button"
                onClick={() => {
                  setOrderSearchId("");
                  loadOrders();
                }}
              >
                Скинути
              </button>
            </div>

            <div className="list">
              {ordersLoading ? (
                <div className="muted">Завантаження...</div>
              ) : orders.length ? (
                orders.map((order) => (
                  <div className="order-box" key={order.id}>
                    <div className="order-box-title">Замовлення #{order.id}</div>
                    <div className="order-box-meta">{formatOrderMeta(order)}</div>

                    <div className="order-actions">
                      <button
                        className="btn ghost order-details-btn"
                        type="button"
                        onClick={() => toggleOrderDetails(order.id)}
                      >
                        Деталі
                      </button>

                      <button
                        className="btn pay-btn"
                        type="button"
                        disabled={!canPayOrder(order)}
                        onClick={() => openPayModal(order.id)}
                      >
                        Сплатити
                      </button>

                      <button
                        className="btn modalbtn order-cancel-btn"
                        type="button"
                        disabled={!canCancelOrder(order)}
                        onClick={() => cancelOrder(order.id)}
                      >
                        Відмінити
                      </button>
                    </div>

                    {expandedOrders[order.id] && (
                      <div className="order-details-box">
                        {orderDetailsLoading[order.id] ? (
                          <div className="muted">Завантаження деталей...</div>
                        ) : (
                          <pre className="order-details-pre">
                            {(orderDetailsMap[order.id] || []).join("\n")}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="muted">Замовлень немає</div>
              )}
            </div>

            <div className={`hint ${ordersMsgType}`}>{ordersMsg}</div>
          </div>
        </div>
      )}
      {isPayModalOpen && (
        <div className="modal" onClick={() => setIsPayModalOpen(false)}>
          <div
            className="modal-card pay-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="logoPayPal">
              <img src={PayPal}></img>
            </div> 
            <div className="galochka">
              <img src={Galochka}></img>
            </div>

            <div className="pay-modal-body">
              {selectedOrder && (
                <div className="pay-price">
                  Сума до оплати:{" "}
                  <strong>
                    {selectedOrder.items
                      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
                      .toFixed(2)} ₴
                  </strong>
                </div>
              )}
            </div>

            <div className="row centre" style={{ marginTop: "16px", gap: "10px" }}>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setIsPayModalOpen(false)}
              >
                Закрити
              </button>

              <button
                className="btn"
                type="button"
                onClick={() => selectedOrderId !== null && payOrder(selectedOrderId)}
              >
                Підтвердити оплату
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedProduct && (
        <div className="modal">
          <div
            className="modal-backdrop"
            onClick={() => setSelectedProduct(null)}
          ></div>

          <div className="modal-card wide product-details-modal">
            <div className="modal-head">
              <div className="modal-title">{selectedProduct.name}</div>
              <button
                className="iconbtn"
                type="button"
                onClick={() => setSelectedProduct(null)}
              >
                ✕
              </button>
            </div>

            <div className="product-details-content">
              <div className="product-details-image-wrap">
                <img
                  className="product-details-image"
                  src={selectedProduct.imageUrl || FALLBACK_IMG}
                  alt={selectedProduct.name}
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_IMG;
                  }}
                />
              </div>

              <div className="product-details-info">
                <div className="product-details-name">{selectedProduct.name}</div>

                <div className="product-details-meta">
                  <div>
                    <span className="product-details-label">Ціна:</span>{" "}
                    <strong>{Number(selectedProduct.price).toFixed(2)} ₴</strong>
                  </div>

                  <div>
                    <span className="product-details-label">Залишок:</span>{" "}
                    <strong>{selectedProduct.stock}</strong>
                  </div>

                  <div>
                    <span className="product-details-label">Категорія:</span>{" "}
                    <strong>{selectedProduct.category || "—"}</strong>
                  </div>
                </div>

                <div className="product-details-description">
                  {selectedProduct.description}
                </div>

                <div className="row end">
                  <button
                    className="btn modalbtn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(selectedProduct);
                    }}
                    disabled={selectedProduct.stock <= 0}
                  >
                    В кошик
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <footer className="footer">
        <div className="footerContainer">
          <div className="footerRightSide">
            <div className="brand">eMarket</div>
            <div className="phoneNumber">+380 97 814 79 59</div>
            <div className="media">
              <img src={Facebook}></img>
              <img src={Insta}></img>
              <img src={TikTok}></img>
              <img src={Youtube}></img>
            </div>
          </div>
          <div className="footerLeftSide">
            <div className="phoneNumber">Чекаємо Вас</div>
            <div className="cityContainer">
              <div className="city">м. Дніпро</div>
              <div className="adress">пр. Науки, 27, ТРЦ DELMAR MALL, 2й рівень</div>
            </div>
            <div className="cityContainer">
              <div className="city">м. Київ</div>
              <div className="adress">вул. В'ячеслава Чорновола, 41</div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}